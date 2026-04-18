import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";

const db = getDb();
import { permissions, users } from "@/db/schema";

// Fixed key for the removeUser advisory lock. Arbitrary value — the lock
// is scoped globally within the Postgres instance, and tally is
// single-tenant so there's no collision surface. If another code path
// ever needs an advisory lock, register its key here too.
const ADMIN_REMOVAL_LOCK_KEY = 847_293_101;

// Thrown inside removeUserTransaction when the pending remove would drop
// active-admin count to zero. Caught by the caller (removeUserAction) to
// return a friendly error instead of propagating.
//
// Declared here (not in admin-actions.ts) because "use server" files can
// only export async functions — classes and helpers must live in
// ordinary modules.
export class LastAdminError extends Error {
  constructor() {
    super("Cannot remove the last remaining admin.");
    this.name = "LastAdminError";
  }
}

// The DB-level transaction that soft-removes a user with the
// serialization lock + last-admin guard + permission revocation.
// removeUserAction is a thin wrapper that adds the session/requireAdmin
// gate and the BetterAuth session revocation; the race-relevant behavior
// lives here so tests can exercise it without a faked HTTP session.
export async function removeUserTransaction(params: {
  targetUserId: string;
  removerId: string;
}): Promise<void> {
  const { targetUserId, removerId } = params;
  const now = new Date();
  await db.transaction(async (tx) => {
    // Serialize every admin-removal transaction on a fixed advisory lock
    // so the count check and the UPDATE happen atomically against other
    // concurrent removals. The xact_lock flavor auto-releases at
    // commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_REMOVAL_LOCK_KEY})`);

    const [remaining] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(eq(users.role, "admin"), isNull(users.removedAt), sql`${users.id} <> ${targetUserId}`),
      );
    if ((remaining?.count ?? 0) === 0) {
      throw new LastAdminError();
    }

    await tx
      .update(users)
      .set({ removedAt: now, banned: true, banReason: "removed by admin", updatedAt: now })
      .where(and(eq(users.id, targetUserId), isNull(users.removedAt)));
    await tx
      .update(permissions)
      .set({ revokedAt: now, revokedBy: removerId })
      .where(and(eq(permissions.userId, targetUserId), isNull(permissions.revokedAt)));
  });
}
