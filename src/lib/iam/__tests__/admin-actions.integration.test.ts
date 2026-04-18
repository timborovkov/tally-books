import path from "node:path";

import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { LastAdminError, removeUserTransaction } from "@/lib/iam/admin-transactions";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required for integration tests");

let client: Sql;
let db: PostgresJsDatabase<typeof schema>;

async function seedAdmin(email: string): Promise<string> {
  const id = newId();
  await db.insert(schema.users).values({
    id,
    email,
    role: "admin",
    twoFactorEnabled: true,
    twoFactorEnabledAt: new Date(),
    bootstrapCompletedAt: new Date(),
  });
  return id;
}

beforeAll(async () => {
  client = postgres(DATABASE_URL, { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve("src/db/migrations") });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log,
      edit_sessions,
      permissions,
      invites,
      two_factors,
      verifications,
      accounts,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `);
});

describe("removeUserTransaction (last-admin guard + serialization)", () => {
  it("rejects removing the only remaining admin", async () => {
    const soloId = await seedAdmin("solo@example.test");
    await expect(
      removeUserTransaction({ targetUserId: soloId, removerId: soloId }),
    ).rejects.toBeInstanceOf(LastAdminError);

    const [row] = await db
      .select({ removedAt: schema.users.removedAt })
      .from(schema.users)
      .where(eq(schema.users.id, soloId));
    expect(row?.removedAt).toBeNull();
  });

  it("removes an admin when another active admin remains", async () => {
    const aId = await seedAdmin("a@example.test");
    const bId = await seedAdmin("b@example.test");

    await removeUserTransaction({ targetUserId: bId, removerId: aId });

    const active = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), isNull(schema.users.removedAt)));
    expect(active.map((u) => u.id)).toEqual([aId]);
  });

  it("serializes concurrent mutual removals so at least one admin remains", async () => {
    // The bug this test locks down: under default READ COMMITTED, two
    // admins removing each other in parallel could both pass the count
    // guard (each sees the OTHER as still active in its snapshot) and
    // both commit, leaving zero admins. The advisory lock inside
    // removeUserTransaction must serialize these, so exactly one wins.
    const aId = await seedAdmin("a@example.test");
    const bId = await seedAdmin("b@example.test");

    const results = await Promise.allSettled([
      removeUserTransaction({ targetUserId: bId, removerId: aId }),
      removeUserTransaction({ targetUserId: aId, removerId: bId }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LastAdminError);

    const active = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), isNull(schema.users.removedAt)));
    expect(active).toHaveLength(1);
  });

  it("revokes the target's permissions atomically with the removal", async () => {
    const aId = await seedAdmin("a@example.test");
    const bId = await seedAdmin("b@example.test");
    await db.insert(schema.permissions).values({
      userId: bId,
      grantedBy: aId,
      resourceType: "expenses",
      access: "write",
      resourceScope: {},
    });

    await removeUserTransaction({ targetUserId: bId, removerId: aId });

    const perms = await db
      .select({ revokedAt: schema.permissions.revokedAt })
      .from(schema.permissions)
      .where(eq(schema.permissions.userId, bId));
    expect(perms).toHaveLength(1);
    expect(perms[0]?.revokedAt).not.toBeNull();
  });
});
