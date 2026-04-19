import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";

const db = getDb();
import { users } from "@/db/schema";

// The app is "bootstrapped" when at least one active admin has completed
// the setup wizard (password + 2FA + confirm). Pre-bootstrap, the router
// funnels every request to /setup.
export async function adminExists(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(eq(users.role, "admin"), isNotNull(users.bootstrapCompletedAt), isNull(users.removedAt)),
    );
  return (row?.count ?? 0) > 0;
}

// Stricter sibling of `adminExists()` used to gate NEW-admin creation.
//
// `adminExists()` only flips true after the admin finishes 2FA and the
// wizard writes `bootstrap_completed_at`. That window (admin signed up,
// 2FA not yet enrolled) is several minutes wide, and for pre-bootstrap
// routing it's correct to keep treating the instance as "not yet set up"
// so the wizard stays reachable. But for the sign-up gate itself, we
// need to reject as soon as ANY admin row exists — otherwise a second
// /setup visitor could create a competing admin account between the
// first admin's signup and 2FA completion. This check closes that
// window.
export async function anyAdminUserExists(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.removedAt)));
  return (row?.count ?? 0) > 0;
}
