"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";

const db = getDb();
import { invites, users } from "@/db/schema";
import { auth } from "@/lib/auth/auth";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getMailer } from "@/lib/email/mailer";
import {
  createInvite,
  emailBelongsToActiveUser,
  revokeInvite as revokeInviteService,
  tryParseInviteScope,
  type InviteScope,
} from "@/lib/iam/invites";
import { RESOURCE_TYPES, type AccessLevel, type ResourceType } from "@/lib/iam/types";
import { requireAdmin } from "@/lib/iam/session";
import type { ActionResult } from "@/lib/server-action";

// Race-relevant DB work + LastAdminError live in a plain module so this
// "use server" file can import them. A "use server" module itself can
// only export async functions, not classes or helpers.
import { LastAdminError, removeUserTransaction } from "@/lib/iam/admin-transactions";

const VALID_RESOURCE_TYPES = new Set(RESOURCE_TYPES);
const VALID_ACCESS: AccessLevel[] = ["read", "write"];

// Checkboxes in the invite form submit as "<resourceType>:<access>".
// Parse every entry, drop unknown values defensively.
function parseScopeFromFormData(formData: FormData): InviteScope {
  const entries = formData.getAll("scope").map((v) => String(v));
  const out: InviteScope = [];
  for (const entry of entries) {
    const [rt, access] = entry.split(":");
    if (!rt || !access) continue;
    if (!VALID_RESOURCE_TYPES.has(rt as ResourceType)) continue;
    if (!VALID_ACCESS.includes(access as AccessLevel)) continue;
    out.push({ resourceType: rt as ResourceType, access: access as AccessLevel });
  }
  return out;
}

export async function createInviteAction(
  formData: FormData,
): Promise<ActionResult<{ inviteId: string }>> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const scope = parseScopeFromFormData(formData);

  if (!email) return { ok: false, error: "Email is required." };
  if (scope.length === 0) return { ok: false, error: "Pick at least one permission." };
  if (await emailBelongsToActiveUser(email)) {
    return { ok: false, error: "That email already belongs to a user." };
  }
  // Prevent duplicate outstanding invites for the same email.
  const [outstanding] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, email),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, sql`now()`),
      ),
    );
  if (outstanding) {
    return { ok: false, error: "An outstanding invite already exists for this email." };
  }

  try {
    const { invite, token } = await createInvite({
      email,
      scope,
      createdBy: admin.id,
    });
    const inviteUrl = `${env.APP_URL}/invite/${token}`;
    const scopeSummary = scope.map((g) => `${g.access.padEnd(5)}  ${g.resourceType}`).join("\n");
    await getMailer().sendInvite({
      to: email,
      inviteUrl,
      scopeSummary,
      invitedByName: admin.name,
      invitedByEmail: admin.email,
    });
    await recordAudit(db, {
      actorId: admin.id,
      actorKind: "user",
      action: "invite.sent",
      payload: { inviteId: invite.id, email },
    });
    revalidatePath("/admin/invites");
    return { ok: true, data: { inviteId: invite.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invite failed.";
    return { ok: false, error: msg };
  }
}

export async function revokeInviteAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return { ok: false, error: "Missing invite id." };
  await revokeInviteService({ inviteId, revokedBy: admin.id });
  revalidatePath("/admin/invites");
  return { ok: true };
}

export async function removeUserAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const targetUserId = String(formData.get("userId") ?? "");
  if (!targetUserId) return { ok: false, error: "Missing user id." };
  if (targetUserId === admin.id) {
    return { ok: false, error: "You can't remove your own admin account." };
  }

  let removed: boolean;
  try {
    ({ removed } = await removeUserTransaction({ targetUserId, removerId: admin.id }));
  } catch (err) {
    if (err instanceof LastAdminError) {
      return {
        ok: false,
        error: "Can't remove the last remaining admin — promote another user first.",
      };
    }
    throw err;
  }

  // No-op path: target was already removed (concurrent admin tab, retry
  // after network blip). The tx's partial WHERE matched zero rows, so
  // it did NOT write the audit row. Skip the side effects too so we
  // don't revoke an empty session set or spam the path revalidation.
  // Same idempotency contract as markBootstrapCompletedAction /
  // markTwoFactorEnabledAction.
  if (!removed) return { ok: true };

  // Kill their live sessions via the admin plugin. Runs AFTER the tx
  // commits (it's a BetterAuth HTTP call, not a DB op, so it can't be
  // rolled into the tx). If BetterAuth's call throws — or partially
  // succeeds and throws — the removal and audit are already durable,
  // so we swallow the failure: the session cookie will fail its next
  // server-side check against `users.removed_at IS NOT NULL` anyway.
  try {
    await auth.api.revokeUserSessions({
      body: { userId: targetUserId },
      headers: await headers(),
    });
  } catch {
    // BetterAuth throws when the user has no sessions; don't fail the
    // remove for that, and don't fail it on a transient revoke error
    // either — the removal is already committed.
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

// Dashboard data fetches, scoped to the admin layout.
export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  twoFactorEnabledAt: Date | null;
  createdAt: Date;
}

export async function listActiveUsers(): Promise<UserRow[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      twoFactorEnabledAt: users.twoFactorEnabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.removedAt))
    .orderBy(desc(users.createdAt));
  return rows;
}

export interface InviteRow {
  id: string;
  email: string;
  scope: InviteScope;
  createdAt: Date;
  expiresAt: Date;
}

export async function listOutstandingInvites(): Promise<InviteRow[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      scope: invites.scope,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, sql`now()`)),
    )
    .orderBy(desc(invites.createdAt));
  // Validate scope jsonb per row: a corrupted row (manual SQL edit, bad
  // migration) would otherwise crash the admin template on .map(). Skip
  // bad rows — tryParseInviteScope logs the id server-side so the admin
  // can investigate and revoke via direct SQL if needed.
  const out: InviteRow[] = [];
  for (const r of rows) {
    const scope = tryParseInviteScope(r.scope, r.id);
    if (!scope) continue;
    out.push({ ...r, scope });
  }
  return out;
}
