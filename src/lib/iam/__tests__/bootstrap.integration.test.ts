import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { adminExists } from "@/lib/iam/bootstrap";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required for integration tests");

let client: Sql;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(DATABASE_URL, { max: 1 });
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

describe("adminExists", () => {
  it("is false on an empty users table", async () => {
    expect(await adminExists()).toBe(false);
  });

  it("is false if an admin exists but hasn't finished bootstrap", async () => {
    await db.insert(schema.users).values({
      id: newId(),
      email: "pending@example.test",
      role: "admin",
      // bootstrap_completed_at null, twoFactorEnabledAt null — CHECK passes
      // via the `bootstrap_completed_at IS NULL` branch.
    });
    expect(await adminExists()).toBe(false);
  });

  it("is true once a non-removed admin has bootstrap_completed_at set", async () => {
    const id = newId();
    await db.insert(schema.users).values({
      id,
      email: "admin@example.test",
      role: "admin",
      twoFactorEnabledAt: new Date(),
      twoFactorEnabled: true,
      bootstrapCompletedAt: new Date(),
    });
    expect(await adminExists()).toBe(true);

    // Soft-delete → false again. This is the "last admin removed" edge,
    // which the remove-user flow also needs to guard against; captured
    // here so a regression surfaces.
    await db.update(schema.users).set({ removedAt: new Date() }).where(eq(schema.users.id, id));
    expect(await adminExists()).toBe(false);
  });

  it("ignores member users when checking", async () => {
    await db.insert(schema.users).values({
      id: newId(),
      email: "member@example.test",
      role: "member",
      twoFactorEnabledAt: new Date(),
      twoFactorEnabled: true,
      bootstrapCompletedAt: new Date(),
    });
    expect(await adminExists()).toBe(false);
  });
});
