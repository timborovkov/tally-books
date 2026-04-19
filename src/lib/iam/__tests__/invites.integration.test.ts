import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import {
  createInvite,
  emailBelongsToActiveUser,
  finalizeInviteAcceptance,
  findUsableInvite,
  hashInviteToken,
  InviteError,
  revokeInvite,
  tryParseInviteScope,
} from "@/lib/iam/invites";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required for integration tests");

let client: Sql;
let db: PostgresJsDatabase<typeof schema>;

async function seedAdmin(email = "admin@example.test"): Promise<string> {
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

async function seedMember(email: string): Promise<string> {
  const id = newId();
  await db.insert(schema.users).values({
    id,
    email,
    role: "member",
    twoFactorEnabled: true,
    twoFactorEnabledAt: new Date(),
    bootstrapCompletedAt: new Date(),
  });
  return id;
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

describe("invites", () => {
  it("createInvite stores only the token hash", async () => {
    const adminId = await seedAdmin();
    const { invite, token } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    expect(invite.tokenHash).toBe(hashInviteToken(token));
    // Sanity: the raw token does NOT appear anywhere in the row.
    expect(invite.tokenHash).not.toContain(token);
  });

  it("createInvite writes invite.created audit atomically with the row", async () => {
    const adminId = await seedAdmin();
    const { invite } = await createInvite({
      email: "audit@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    const audits = await db
      .select({
        action: schema.auditLog.action,
        actorId: schema.auditLog.actorId,
        payload: schema.auditLog.payload,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "invite.created"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBe(adminId);
    expect(audits[0]?.payload).toMatchObject({ inviteId: invite.id, email: "audit@example.test" });
  });

  it("rejects empty scope", async () => {
    const adminId = await seedAdmin();
    await expect(
      createInvite({ email: "x@example.test", scope: [], createdBy: adminId }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("findUsableInvite returns active invites, hides used/expired/revoked", async () => {
    const adminId = await seedAdmin();
    const { token, invite } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });

    expect((await findUsableInvite(token))?.id).toBe(invite.id);
    expect(await findUsableInvite("wrong-token")).toBeNull();

    // Expired
    await db
      .update(schema.invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invites.id, invite.id));
    expect(await findUsableInvite(token)).toBeNull();
  });

  it("finalizeInviteAcceptance creates permissions and marks accepted", async () => {
    const adminId = await seedAdmin();
    const { token, invite } = await createInvite({
      email: "new@example.test",
      scope: [
        { resourceType: "expenses", access: "write" },
        { resourceType: "invoices", access: "read", scope: { entityId: "ent_1" } },
      ],
      createdBy: adminId,
    });

    const newUserId = await seedMember("new@example.test");
    await finalizeInviteAcceptance({ token, userId: newUserId });

    const [refreshed] = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.id, invite.id));
    if (!refreshed) throw new Error("invite row missing after accept");
    expect(refreshed.acceptedAt).not.toBeNull();
    expect(refreshed.acceptedByUserId).toBe(newUserId);

    const perms = await db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.userId, newUserId));
    expect(perms).toHaveLength(2);
    expect(perms.map((p) => p.resourceType).sort()).toEqual(["expenses", "invoices"]);

    // Audit trail: one invite.accepted + one permission.granted per grant.
    const audit = await db.select().from(schema.auditLog);
    const actions = audit.map((a) => a.action).sort();
    expect(actions).toContain("invite.accepted");
    expect(actions.filter((a) => a === "permission.granted")).toHaveLength(2);
  });

  it("concurrent finalize calls produce exactly one permission set (TOCTOU guard)", async () => {
    // Simulates the race the UPDATE+returning() guard must defend: two
    // callers both pass the advisory findUsableInvite check, then race into
    // the transaction. Only one UPDATE matches the partial WHERE on
    // acceptedAt IS NULL; the other rejects before inserting duplicates.
    const adminId = await seedAdmin();
    const { token } = await createInvite({
      email: "new@example.test",
      scope: [
        { resourceType: "expenses", access: "write" },
        { resourceType: "invoices", access: "read" },
      ],
      createdBy: adminId,
    });
    const userId = await seedMember("new@example.test");

    const results = await Promise.allSettled([
      finalizeInviteAcceptance({ token, userId }),
      finalizeInviteAcceptance({ token, userId }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InviteError);

    // Exactly two permissions — not four — even though two calls ran.
    const perms = await db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.userId, userId));
    expect(perms).toHaveLength(2);
  });

  it("double-accept fails", async () => {
    const adminId = await seedAdmin();
    const { token } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    const u1 = await seedMember("new@example.test");
    await finalizeInviteAcceptance({ token, userId: u1 });
    await expect(finalizeInviteAcceptance({ token, userId: u1 })).rejects.toBeInstanceOf(
      InviteError,
    );
  });

  it("rejects an invite whose jsonb scope has been corrupted", async () => {
    // Simulates a DB-level corruption (manual SQL edit, bad migration,
    // external tool write) — the runtime validator must catch it before
    // we try to insert permissions with undefined enum values.
    const adminId = await seedAdmin();
    const { token, invite } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    // Overwrite scope with garbage.
    await db
      .update(schema.invites)
      .set({ scope: [{ nope: "this isn't a real grant" }] })
      .where(eq(schema.invites.id, invite.id));
    const userId = await seedMember("new@example.test");
    await expect(finalizeInviteAcceptance({ token, userId })).rejects.toBeInstanceOf(InviteError);

    // No permissions leaked; invite still unaccepted.
    const perms = await db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.userId, userId));
    expect(perms).toHaveLength(0);
    const [row] = await db
      .select({ acceptedAt: schema.invites.acceptedAt })
      .from(schema.invites)
      .where(eq(schema.invites.id, invite.id));
    expect(row?.acceptedAt).toBeNull();
  });

  it("revokeInvite stamps revoked_at and hides the invite", async () => {
    const adminId = await seedAdmin();
    const { token, invite } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    await revokeInvite({ inviteId: invite.id, revokedBy: adminId });
    const [row] = await db.select().from(schema.invites).where(eq(schema.invites.id, invite.id));
    if (!row) throw new Error("invite row missing after revoke");
    expect(row.revokedAt).not.toBeNull();
    expect(await findUsableInvite(token)).toBeNull();
  });

  it("revokeInvite does NOT write an audit row when the UPDATE matches zero rows", async () => {
    // Second revoke on an already-revoked invite, or revoke on a missing
    // id, should be a no-op. The audit log would otherwise grow one
    // phantom `invite.revoked` row per repeat, making the audit reader
    // misrepresent reality.
    const adminId = await seedAdmin();
    const { invite } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });

    await revokeInvite({ inviteId: invite.id, revokedBy: adminId }); // real revoke
    await revokeInvite({ inviteId: invite.id, revokedBy: adminId }); // no-op
    await revokeInvite({ inviteId: "does-not-exist", revokedBy: adminId }); // no-op

    const audit = await db.select({ action: schema.auditLog.action }).from(schema.auditLog);
    const revokes = audit.filter((a) => a.action === "invite.revoked");
    expect(revokes).toHaveLength(1);
  });

  it("tryParseInviteScope returns null on malformed jsonb (for list paths)", async () => {
    // Seeds a corrupted scope the way DB drift could — listOutstandingInvites
    // must skip this row instead of crashing when the template maps over it.
    const adminId = await seedAdmin();
    const { invite } = await createInvite({
      email: "new@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      createdBy: adminId,
    });
    await db
      .update(schema.invites)
      .set({ scope: [{ nope: "bogus" }] })
      .where(eq(schema.invites.id, invite.id));
    const [row] = await db
      .select({ scope: schema.invites.scope, id: schema.invites.id })
      .from(schema.invites)
      .where(eq(schema.invites.id, invite.id));
    if (!row) throw new Error("invite row missing");

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(tryParseInviteScope(row.scope, row.id)).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    consoleErrorSpy.mockRestore();

    // Still usable on a valid scope.
    expect(
      tryParseInviteScope([{ resourceType: "expenses", access: "read" }], "probe"),
    ).toHaveLength(1);
  });

  it("emailBelongsToActiveUser flags re-use, ignores removed users", async () => {
    const active = "current@example.test";
    await seedMember(active);
    expect(await emailBelongsToActiveUser(active)).toBe(true);
    expect(await emailBelongsToActiveUser(active.toUpperCase())).toBe(true);

    // Soft-delete and verify it no longer blocks.
    await db
      .update(schema.users)
      .set({ removedAt: new Date() })
      .where(eq(schema.users.email, active));
    expect(await emailBelongsToActiveUser(active)).toBe(false);
  });
});
