import { randomBytes, createHash } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";

const db = getDb();
import type { Invite } from "@/db/schema";
import { invites, permissions, users } from "@/db/schema";
import { nowUtcMs } from "@/lib/dates";

import { recordAudit } from "@/lib/audit";
import { RESOURCE_TYPES, type AccessLevel, type ResourceType } from "./types";

// Invite scope is a snapshot of the permissions the admin picked at
// invite time. Stored as jsonb; acceptance inserts one `permissions`
// row per grant. `scope` on each grant is an opaque JSON object that
// the permission-scope check interprets ({} = wildcard).
export interface InviteScopeGrant {
  resourceType: ResourceType;
  access: AccessLevel;
  scope?: Record<string, unknown>;
}

export type InviteScope = InviteScopeGrant[];

// Schema used to validate the jsonb column at read time. The column is
// typed as `unknown` at the DB boundary — we trust our own writes (they
// go through createInvite, which accepts a typed InviteScope), but a
// defensive parse here catches DB corruption, manual SQL edits, or a
// future schema drift before the bad data hits tx.insert(permissions)
// where it would surface as an opaque Postgres constraint violation
// instead of a meaningful InviteError.
const inviteScopeSchema: z.ZodType<InviteScope> = z.array(
  z.object({
    resourceType: z.enum(RESOURCE_TYPES as readonly [ResourceType, ...ResourceType[]]),
    access: z.enum(["read", "write"]),
    scope: z.record(z.string(), z.unknown()).optional(),
  }),
);

function parseInviteScope(raw: unknown, inviteId: string): InviteScope {
  const parsed = inviteScopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InviteError(
      "invalid_scope",
      `Invite ${inviteId} has a malformed scope jsonb — refusing to process.`,
    );
  }
  return parsed.data;
}

// Non-throwing variant for display paths (admin invite list). Returns
// null when the jsonb is corrupted so the caller can skip the row
// without killing the whole page render. Logs server-side so the
// corruption is discoverable.
export function tryParseInviteScope(raw: unknown, inviteId: string): InviteScope | null {
  const parsed = inviteScopeSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[invites] Invite ${inviteId} has a malformed scope jsonb — skipping from list.`);
    return null;
  }
  return parsed.data;
}

export class InviteError extends Error {
  constructor(
    public code:
      | "not_found"
      | "already_accepted"
      | "revoked"
      | "expired"
      | "email_in_use"
      | "invalid_scope",
    message: string,
  ) {
    super(message);
    this.name = "InviteError";
  }
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Raw token never touches the DB. We hand it to the caller, they email it,
// and the URL carries it back. The hash is what we look up.
export async function createInvite(args: {
  email: string;
  scope: InviteScope;
  createdBy: string;
  ttlHours?: number;
}): Promise<{ invite: Invite; token: string }> {
  if (args.scope.length === 0) {
    throw new InviteError("invalid_scope", "At least one permission grant is required.");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token);
  const ttlHours = args.ttlHours ?? 72;
  const expiresAt = new Date(nowUtcMs() + ttlHours * 60 * 60 * 1000);

  // Insert + audit in one tx so `invite row committed without an audit
  // entry` is not representable. Same pattern as finalizeInviteAcceptance.
  const invite = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invites)
      .values({
        email: args.email.toLowerCase(),
        scope: args.scope,
        tokenHash,
        createdBy: args.createdBy,
        expiresAt,
      })
      .returning();

    if (!row) throw new Error("Invite insert returned no row");

    await recordAudit(tx, {
      actorId: args.createdBy,
      actorKind: "user",
      action: "invite.created",
      payload: { inviteId: row.id, email: row.email, scope: args.scope },
    });

    return row;
  });

  return { invite, token };
}

// Look up the invite by the hash of the incoming raw token. Returns null
// for anything we shouldn't act on.
export async function findUsableInvite(token: string): Promise<Invite | null> {
  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, sql`now()`),
      ),
    );
  return invite ?? null;
}

// Marks an invite accepted by a (presumably just-created) user, and
// inserts their permission rows. Does NOT create the user — that's the
// caller's job (via auth.api.signUpEmail).
//
// Concurrency note: the findUsableInvite read outside the transaction is
// advisory only — the UPDATE inside the tx re-asserts `accepted_at IS NULL`
// and we check affected-row count. Under READ COMMITTED isolation two
// concurrent callers can both pass the advisory check, but only one
// UPDATE matches the partial WHERE; the other sees 0 rows and bails
// before inserting duplicate permissions.
export async function finalizeInviteAcceptance(args: {
  token: string;
  userId: string;
}): Promise<void> {
  const invite = await findUsableInvite(args.token);
  if (!invite) throw new InviteError("not_found", "Invite not usable.");

  const scope = parseInviteScope(invite.scope, invite.id);

  // Everything that makes the invite "accepted" goes in one atomic unit:
  // the invite UPDATE, the permissions INSERT, and the audit rows. If
  // the audit writes were outside the tx, a failure there would leave
  // the invite consumed and permissions committed but nothing to
  // compensate against (the caller's catch path can't roll permissions
  // back cleanly because permissions.user_id has ON DELETE NO ACTION
  // and the cleanup chain would need to include permissions too). With
  // audits inside, the tx rolls back as a unit and the caller can
  // safely delete the freshly-created user row.
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(invites)
      .set({ acceptedAt: new Date(), acceptedByUserId: args.userId })
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
      .returning({ id: invites.id });
    if (updated.length === 0) {
      throw new InviteError(
        "already_accepted",
        "Invite was consumed or revoked before this request completed.",
      );
    }
    if (scope.length > 0) {
      await tx.insert(permissions).values(
        scope.map((grant) => ({
          userId: args.userId,
          resourceType: grant.resourceType,
          access: grant.access,
          resourceScope: grant.scope ?? {},
          grantedBy: invite.createdBy,
        })),
      );
    }

    await recordAudit(tx, {
      actorId: args.userId,
      actorKind: "user",
      action: "invite.accepted",
      payload: { inviteId: invite.id, grants: scope.length },
    });
    for (const grant of scope) {
      await recordAudit(tx, {
        actorId: invite.createdBy,
        actorKind: "user",
        action: "permission.granted",
        payload: {
          targetUserId: args.userId,
          resourceType: grant.resourceType,
          access: grant.access,
          scope: grant.scope ?? {},
        },
      });
    }
  });
}

export async function revokeInvite(args: { inviteId: string; revokedBy: string }): Promise<void> {
  // Use .returning() to detect whether the UPDATE actually changed a
  // row. The WHERE clause only matches invites that are still usable
  // (not revoked, not accepted, right id), so a no-op UPDATE means the
  // caller tried to revoke something already revoked / accepted /
  // missing. Skip the audit in that case — otherwise we'd be writing
  // phantom "invite.revoked" rows that the audit reader can't
  // distinguish from real revocations.
  //
  // UPDATE + audit live in one tx so `invite revoked without an audit
  // entry` is not representable. Same pattern as
  // finalizeInviteAcceptance / removeUserTransaction.
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(invites)
      .set({ revokedAt: new Date(), revokedBy: args.revokedBy })
      .where(
        and(eq(invites.id, args.inviteId), isNull(invites.revokedAt), isNull(invites.acceptedAt)),
      )
      .returning({ id: invites.id });
    if (updated.length === 0) return;

    await recordAudit(tx, {
      actorId: args.revokedBy,
      actorKind: "user",
      action: "invite.revoked",
      payload: { inviteId: args.inviteId },
    });
  });
}

// Used by the auth-layer signUpEmail gate: does a usable invite (not yet
// accepted, not revoked, not expired) exist for this email? Distinct from
// findUsableInvite which looks up by hashed token.
export async function hasUsableInviteForEmail(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, email.toLowerCase()),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, sql`now()`),
      ),
    );
  return Boolean(row);
}

// Sanity guard used before createInvite: don't invite an email that
// already belongs to an active user.
export async function emailBelongsToActiveUser(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.removedAt)));
  return Boolean(row);
}
