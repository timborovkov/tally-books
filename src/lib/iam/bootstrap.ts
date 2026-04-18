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
