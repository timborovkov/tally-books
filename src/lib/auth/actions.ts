"use server";

import { headers } from "next/headers";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";

const db = getDb();
import { accounts, permissions, sessions, twoFactors, users } from "@/db/schema";
import { auth } from "@/lib/auth/auth";
import { anyAdminUserExists } from "@/lib/iam/bootstrap";
import { recordAudit } from "@/lib/audit";
import { finalizeInviteAcceptance, findUsableInvite } from "@/lib/iam/invites";

import type { ActionResult } from "@/lib/server-action";

import { PASSWORD_REASON_MESSAGES, validatePassword } from "./password-policy";

// Setup wizard — step 1. Creates the bootstrap admin. No session is
// created yet; the wizard then prompts for 2FA enrollment (step 2) and
// calls markBootstrapCompleted (step 3).
export async function createBootstrapAdminAction(input: {
  email: string;
  name: string;
  password: string;
}): Promise<ActionResult<{ userId: string }>> {
  // Use the stricter `anyAdminUserExists` (not `adminExists`). The latter
  // only flips after the first admin completes 2FA, which leaves a
  // multi-minute window where a second /setup visitor could create
  // another admin account under a different email. Guarding on the
  // admin row's existence (regardless of bootstrap_completed_at) closes
  // that window. Two simultaneous callers racing past this check at
  // the same millisecond can still both reach signUpEmail, but they'd
  // collide on users.email uniqueness (same email) or produce two rows
  // that the wizard's second visit can surface for admin cleanup (different
  // emails). DB-level advisory-lock serialization is a v1.0 item.
  if (await anyAdminUserExists()) {
    return { ok: false, error: "An admin already exists. Setup is complete." };
  }
  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, error: PASSWORD_REASON_MESSAGES[pw.reason] };

  // Every other email path in the codebase normalizes to lowercase
  // (createInvite, emailBelongsToActiveUser, hasUsableInviteForEmail).
  // Bootstrap must too — otherwise "Alice@Example.com" lands in users as
  // mixed-case and later invite-creation / duplicate checks (which do
  // `eq(users.email, lower(input))` under Postgres's case-sensitive text
  // compare) miss the row.
  const email = input.email.trim().toLowerCase();

  try {
    // `returnHeaders` is intentionally omitted — BetterAuth wraps the
    // payload as { headers, response } only when it's true, and we don't
    // need the outgoing headers here. Without the flag, the return is
    // the endpoint payload directly: { token, user }.
    const result = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email,
        password: input.password,
      },
      headers: await headers(),
    });
    if (!result?.user?.id) {
      return { ok: false, error: "Could not create admin user." };
    }
    const userId = result.user.id;
    // Promote to admin. The admin plugin stores role as a string but our
    // column is the user_role enum; 'admin' is a valid value. users.updated_at
    // has no ON UPDATE trigger, so every app-level mutation sets it
    // explicitly — otherwise "last modified" queries would stall.
    await db
      .update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(users.id, userId));
    await recordAudit(db, {
      actorId: userId,
      actorKind: "user",
      action: "bootstrap.admin.created",
      payload: { email },
    });
    return { ok: true, data: { userId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signup failed.";
    return { ok: false, error: msg };
  }
}

// Marks a user as bootstrap-completed. Called after their 2FA enrollment
// succeeds — both for the admin wizard and for invited users finishing
// /enroll-2fa. Idempotent: if `bootstrapCompletedAt` is already set the
// action returns ok without rewriting the timestamp or emitting another
// audit row. Partial re-runs (user refreshes mid-flow, two tabs race)
// therefore never reset the canonical completion time or spam the log.
export async function markBootstrapCompletedAction(): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user) return { ok: false, error: "User not found." };
  if (!user.twoFactorEnabledAt) {
    return { ok: false, error: "2FA must be enabled before completing bootstrap." };
  }
  if (user.bootstrapCompletedAt) return { ok: true };

  // `.returning()` lets us detect whether the UPDATE actually flipped
  // the flag. Two concurrent tabs would both pass the early-return above
  // (each sees bootstrapCompletedAt=null in its snapshot) — but only the
  // first UPDATE wins the partial WHERE. The loser must NOT emit a
  // second `bootstrap.completed` audit row.
  const now = new Date();
  const updated = await db
    .update(users)
    .set({ bootstrapCompletedAt: now, updatedAt: now })
    .where(and(eq(users.id, user.id), isNull(users.bootstrapCompletedAt)))
    .returning({ id: users.id });
  if (updated.length === 0) return { ok: true };

  await recordAudit(db, {
    actorId: user.id,
    actorKind: "user",
    action: "bootstrap.completed",
  });
  return { ok: true };
}

// Called from the 2FA enrollment flow once verifyTotp succeeds. Our
// CHECK constraint and `requireAuth` trust `two_factor_enabled_at`, so
// this action must ONLY flip it when a real, verified TOTP factor
// actually exists for the user. Without this check, any authenticated
// client could POST directly to this server action and satisfy the 2FA
// gate without ever enrolling — the twoFactor plugin inserts into
// `two_factors` only after verifyTotp succeeds, so row presence is our
// trust signal.
export async function markTwoFactorEnabledAction(): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const [factor] = await db
    .select({ id: twoFactors.id })
    .from(twoFactors)
    .where(and(eq(twoFactors.userId, session.user.id), eq(twoFactors.verified, true)));
  if (!factor) {
    return { ok: false, error: "No verified TOTP factor found. Complete enrollment first." };
  }

  // `.returning()` — same idempotency story as markBootstrapCompletedAction.
  // The partial WHERE (isNull(twoFactorEnabledAt)) means a second caller
  // matches zero rows; we skip the audit so concurrent tabs can't write
  // duplicate `2fa.enrolled` entries.
  const now = new Date();
  const updated = await db
    .update(users)
    .set({ twoFactorEnabledAt: now, twoFactorEnabled: true, updatedAt: now })
    .where(and(eq(users.id, session.user.id), isNull(users.twoFactorEnabledAt)))
    .returning({ id: users.id });
  if (updated.length === 0) return { ok: true };

  await recordAudit(db, {
    actorId: session.user.id,
    actorKind: "user",
    action: "2fa.enrolled",
  });
  return { ok: true };
}

// Invite accept — creates the user via BetterAuth sign-up, wires up
// permissions, and marks the invite consumed. Does NOT complete bootstrap
// yet; the caller redirects to /enroll-2fa which then calls
// markTwoFactorEnabledAction + markBootstrapCompletedAction.
//
// Atomicity: signUpEmail and finalizeInviteAcceptance run in separate
// transactions. If finalize fails after signup succeeds (concurrent
// acceptor wins the accepted_at IS NULL race, malformed scope jsonb,
// audit-log write failure, DB glitch), finalizeInviteAcceptance's
// internal transaction rolls everything back (invite update +
// permissions + audit rows) so there's nothing committed on that side
// to clean up. We only need to delete the freshly-created user row so
// the invitee can retry.
//
// `sessions.user_id` and `permissions.user_id` are both ON DELETE
// NO ACTION per data-structure.md §4.2 and §4.4. BetterAuth may have
// issued a session even with `autoSignIn: false` (the request headers
// drive cookie setup), so we delete sessions explicitly before users.
// `permissions` is included defensively: the finalize tx is
// all-or-nothing today, but if a future refactor splits the audit
// writes back out there could be permissions rows committed before
// the audit failure lands us here — deleting them first prevents a
// silent FK violation.
export async function acceptInviteAction(input: {
  token: string;
  name: string;
  password: string;
}): Promise<ActionResult<{ userId: string }>> {
  const invite = await findUsableInvite(input.token);
  if (!invite) return { ok: false, error: "Invite is invalid, revoked, or expired." };

  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, error: PASSWORD_REASON_MESSAGES[pw.reason] };

  let createdUserId: string | null = null;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: invite.email,
        password: input.password,
      },
      headers: await headers(),
    });
    if (!result?.user?.id) {
      return { ok: false, error: "Could not create user." };
    }
    createdUserId = result.user.id;
    await finalizeInviteAcceptance({ token: input.token, userId: createdUserId });
    return { ok: true, data: { userId: createdUserId } };
  } catch (err) {
    // Compensate: if we created a user but failed to attach them to the
    // invite, they'd be orphaned (no permissions) AND blocking their own
    // retry (email unique). Delete the half-created rows so the invitee
    // can try again.
    if (createdUserId) {
      try {
        // Order matters: delete everything that FKs back to users first
        // (sessions has ON DELETE NO ACTION; accounts + two_factors
        // cascade but we delete them explicitly so failures surface
        // close to their cause). Wrap in a tx so a partial rollback
        // doesn't leave us in a worse state than before.
        await db.transaction(async (tx) => {
          await tx.delete(sessions).where(eq(sessions.userId, createdUserId!));
          await tx.delete(permissions).where(eq(permissions.userId, createdUserId!));
          await tx.delete(twoFactors).where(eq(twoFactors.userId, createdUserId!));
          await tx.delete(accounts).where(eq(accounts.userId, createdUserId!));
          await tx.delete(users).where(eq(users.id, createdUserId!));
        });
      } catch {
        // If rollback fails, the orphan survives. The accept-invite
        // retry will fail with "email in use" until an admin cleans
        // up; the audit log shows the original failure.
      }
    }
    const msg = err instanceof Error ? err.message : "Invite acceptance failed.";
    return { ok: false, error: msg };
  }
}
