import path from "node:path";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { PermissionDeniedError, assertCan, can } from "@/lib/iam/permissions";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required for integration tests");

let client: Sql;
let db: PostgresJsDatabase<typeof schema>;

// Seed helpers: admins have their CHECK satisfied by enabling 2FA inline;
// bootstrap_completed_at stays null so the users_2fa_required constraint
// is satisfied via the "bootstrap_completed_at IS NULL" branch.
async function seedUser(args: {
  email: string;
  role: "admin" | "member";
  removed?: boolean;
}): Promise<string> {
  const id = newId();
  await db.insert(schema.users).values({
    id,
    email: args.email,
    name: args.email,
    role: args.role,
    removedAt: args.removed ? new Date() : null,
  });
  return id;
}

async function loadUser(userId: string): Promise<schema.User> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.id} = ${userId}`);
  if (!user) throw new Error(`Seed user ${userId} missing`);
  return user;
}

async function seedPermission(args: {
  userId: string;
  grantedBy: string;
  resourceType: schema.Permission["resourceType"];
  access: "read" | "write";
  scope?: Record<string, unknown>;
  revoked?: boolean;
}): Promise<void> {
  await db.insert(schema.permissions).values({
    userId: args.userId,
    grantedBy: args.grantedBy,
    resourceType: args.resourceType,
    access: args.access,
    resourceScope: args.scope ?? {},
    revokedAt: args.revoked ? new Date() : null,
    revokedBy: args.revoked ? args.grantedBy : null,
  });
}

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

describe("permissions.can", () => {
  it("lets admins through without hitting the permissions table", async () => {
    const adminId = await seedUser({ email: "admin@example.test", role: "admin" });
    const admin = await loadUser(adminId);
    expect(await can(db, admin, "expenses", "write")).toBe(true);
  });

  it("denies removed users even if they had a grant", async () => {
    const adminId = await seedUser({ email: "admin@example.test", role: "admin" });
    const userId = await seedUser({ email: "user@example.test", role: "member", removed: true });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "write",
    });
    const user = await loadUser(userId);
    expect(await can(db, user, "expenses", "read")).toBe(false);
  });

  it("allows explicit grant, denies revoked grant", async () => {
    const adminId = await seedUser({ email: "admin@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "read",
    });
    const user = await loadUser(userId);
    expect(await can(db, user, "expenses", "read")).toBe(true);
    expect(await can(db, user, "invoices", "read")).toBe(false);

    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "invoices",
      access: "read",
      revoked: true,
    });
    expect(await can(db, user, "invoices", "read")).toBe(false);
  });

  it("treats write grants as satisfying read requests", async () => {
    const adminId = await seedUser({ email: "a@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "write",
    });
    const user = await loadUser(userId);
    expect(await can(db, user, "expenses", "read")).toBe(true);
    expect(await can(db, user, "expenses", "write")).toBe(true);
  });

  it("matches empty-scope grants as wildcards", async () => {
    const adminId = await seedUser({ email: "a@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "read",
    });
    const user = await loadUser(userId);
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1" })).toBe(true);
  });

  it("enforces scope subset matching on scoped grants", async () => {
    const adminId = await seedUser({ email: "a@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "read",
      scope: { entityId: "ent_1" },
    });
    const user = await loadUser(userId);
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1" })).toBe(true);
    expect(await can(db, user, "expenses", "read", { entityId: "ent_2" })).toBe(false);
    // Caller didn't supply scope, but grant is scoped — denies.
    expect(await can(db, user, "expenses", "read")).toBe(false);
  });

  // Locks in the intentional subset-match behavior: a scoped grant does
  // NOT restrict dimensions the admin didn't mention. See the docstring
  // on scopeMatches in permissions.ts for rationale.
  it("allows extra request keys not mentioned in the grant (wildcard on unmentioned dimensions)", async () => {
    const adminId = await seedUser({ email: "a@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "read",
      scope: { entityId: "ent_1" },
    });
    const user = await loadUser(userId);
    // Request adds fyYear — grant doesn't mention it, so it's not a
    // restriction dimension; entityId matches → allow.
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1", fyYear: "FY2024" })).toBe(
      true,
    );
    // Changing the mentioned dimension still denies.
    expect(await can(db, user, "expenses", "read", { entityId: "ent_2", fyYear: "FY2024" })).toBe(
      false,
    );
  });

  it("denies when the grant has more restriction dimensions than the request satisfies", async () => {
    const adminId = await seedUser({ email: "a@example.test", role: "admin" });
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    await seedPermission({
      userId,
      grantedBy: adminId,
      resourceType: "expenses",
      access: "read",
      scope: { entityId: "ent_1", fyYear: "FY2024" },
    });
    const user = await loadUser(userId);
    // Request matches only entityId; fyYear on the grant isn't satisfied.
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1" })).toBe(false);
    // Full match succeeds.
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1", fyYear: "FY2024" })).toBe(
      true,
    );
    // Different year denies.
    expect(await can(db, user, "expenses", "read", { entityId: "ent_1", fyYear: "FY2023" })).toBe(
      false,
    );
  });

  it("assertCan throws PermissionDeniedError on deny", async () => {
    const userId = await seedUser({ email: "u@example.test", role: "member" });
    const user = await loadUser(userId);
    await expect(assertCan(db, user, "expenses", "write")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});
