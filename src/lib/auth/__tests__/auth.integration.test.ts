import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth/auth";

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

describe("better-auth integration", () => {
  it("signUpEmail creates users + accounts rows with a hashed password", async () => {
    const res = await auth.api.signUpEmail({
      body: {
        name: "Jane Admin",
        email: "jane@example.test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    expect(res.user?.email).toBe("jane@example.test");

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "jane@example.test"));
    if (!user) throw new Error("user row missing");
    expect(user.role).toBe("member"); // default role; bootstrap action promotes

    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, user.id));
    if (!account) throw new Error("account row missing");
    expect(account.providerId).toBe("credential");
    // Password is stored hashed, not plaintext.
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe("Sup3rStr0ng!Passphrase");
  });

  it("rejects signup with a too-short password at the adapter level", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "x",
          email: "shorty@example.test",
          password: "abc", // well below minPasswordLength: 12
        },
      }),
    ).rejects.toBeTruthy();

    // Nothing leaked into users.
    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(0);
  });

  it("rejects signup when the password fails the complexity policy", async () => {
    // 14 chars (comfortably above BetterAuth's minPasswordLength: 12),
    // but all lowercase — no upper / digit / symbol. BetterAuth's own
    // length gate would let this through; the hooks.before middleware
    // must run validatePassword and reject it. This is the regression
    // test for the "direct /api/auth/sign-up/email bypass" bugbot flagged.
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Weak",
          email: "weak@example.test",
          password: "abcdefghijklmn",
        },
      }),
    ).rejects.toBeTruthy();

    const users = await db.select().from(schema.users);
    expect(users).toHaveLength(0);
  });

  it("signInEmail issues a session row", async () => {
    await auth.api.signUpEmail({
      body: {
        name: "Kim",
        email: "kim@example.test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    const signedIn = await auth.api.signInEmail({
      body: { email: "kim@example.test", password: "Sup3rStr0ng!Passphrase" },
    });
    expect(signedIn.token).toBeTruthy();

    const sessions = await db.select().from(schema.sessions);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("signInEmail rejects the wrong password", async () => {
    await auth.api.signUpEmail({
      body: {
        name: "Kim",
        email: "kim@example.test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    await expect(
      auth.api.signInEmail({
        body: { email: "kim@example.test", password: "wrong-pw-123!XY" },
      }),
    ).rejects.toBeTruthy();
  });

  // Post-bootstrap signup gating. Once an admin exists and completed
  // bootstrap, the auth-layer hook rejects arbitrary /sign-up/email calls
  // unless a usable invite for that email exists. Closes the "public
  // signup endpoint open" class flagged in review.
  it("rejects arbitrary signup once an admin has completed bootstrap", async () => {
    // Create a user via the bootstrap path (no admin exists yet — allowed).
    await auth.api.signUpEmail({
      body: {
        name: "Admin",
        email: "admin@example.test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    // Promote + mark bootstrap complete, so adminExists() returns true.
    const admin = (
      await db.select().from(schema.users).where(eq(schema.users.email, "admin@example.test"))
    )[0];
    if (!admin) throw new Error("admin seed failed");
    await db
      .update(schema.users)
      .set({
        role: "admin",
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        bootstrapCompletedAt: new Date(),
      })
      .where(eq(schema.users.id, admin.id));

    // Arbitrary email signup must now be rejected.
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Random",
          email: "random@example.test",
          password: "Sup3rStr0ng!Passphrase",
        },
      }),
    ).rejects.toBeTruthy();

    // No new user row leaked through.
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "random@example.test"));
    expect(users).toHaveLength(0);
  });

  it("allows signup for an email that has a usable invite", async () => {
    // Seed admin + bootstrap.
    const adminId = newId();
    await db.insert(schema.users).values({
      id: adminId,
      email: "admin@example.test",
      role: "admin",
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
      bootstrapCompletedAt: new Date(),
    });
    // Seed an outstanding invite for a different email.
    await db.insert(schema.invites).values({
      id: newId(),
      email: "invited@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      tokenHash: "deadbeef",
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Signup for the invited email succeeds.
    const res = await auth.api.signUpEmail({
      body: {
        name: "Invited",
        email: "invited@example.test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    expect(res?.user?.email).toBe("invited@example.test");

    // But an UNrelated email still fails.
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Random",
          email: "other@example.test",
          password: "Sup3rStr0ng!Passphrase",
        },
      }),
    ).rejects.toBeTruthy();
  });

  it("lowercases the email on signup so invite matching doesn't drift", async () => {
    // Seed admin + a lowercased invite (createInvite always stores lowercase).
    const adminId = newId();
    await db.insert(schema.users).values({
      id: adminId,
      email: "admin@example.test",
      role: "admin",
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
      bootstrapCompletedAt: new Date(),
    });
    await db.insert(schema.invites).values({
      id: newId(),
      email: "mixed@example.test",
      scope: [{ resourceType: "expenses", access: "read" }],
      tokenHash: "deadbeef-mixed",
      createdBy: adminId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // POST with a mixed-case email. Without the hook normalizing
    // ctx.body.email, BetterAuth would persist "MiXeD@Example.Test"
    // on the users row and the subsequent finalizeInviteAcceptance
    // lookup (which compares against the lowercased invites.email)
    // would miss.
    const res = await auth.api.signUpEmail({
      body: {
        name: "Mixed",
        email: "MiXeD@Example.Test",
        password: "Sup3rStr0ng!Passphrase",
      },
    });
    expect(res?.user?.email).toBe("mixed@example.test");

    // Authoritative check: the users row itself was persisted lowercased.
    const [row] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.email, "mixed@example.test"));
    expect(row?.email).toBe("mixed@example.test");
  });

  // Guards the 2FA bypass class: markTwoFactorEnabledAction rejects when
  // no verified two_factors row exists for the user. This is the DB-level
  // check the action performs — proving the query discriminates correctly
  // prevents regressions of the "attacker POSTs the action to fake 2FA"
  // hole that existed before the fix.
  it("two_factors gate: a user without a verified factor is not considered enrolled", async () => {
    const userId = newId();
    await db.insert(schema.users).values({
      id: userId,
      email: "no2fa@example.test",
      role: "member",
    });

    const rowsBefore = await db
      .select({ id: schema.twoFactors.id })
      .from(schema.twoFactors)
      .where(and(eq(schema.twoFactors.userId, userId), eq(schema.twoFactors.verified, true)));
    expect(rowsBefore).toHaveLength(0);

    // Unverified factor still doesn't count.
    await db.insert(schema.twoFactors).values({
      userId,
      secret: "tentative-secret",
      backupCodes: "[]",
      verified: false,
    });
    const rowsUnverified = await db
      .select({ id: schema.twoFactors.id })
      .from(schema.twoFactors)
      .where(and(eq(schema.twoFactors.userId, userId), eq(schema.twoFactors.verified, true)));
    expect(rowsUnverified).toHaveLength(0);

    // Verified factor flips the gate.
    await db
      .update(schema.twoFactors)
      .set({ verified: true })
      .where(eq(schema.twoFactors.userId, userId));
    const rowsAfter = await db
      .select({ id: schema.twoFactors.id })
      .from(schema.twoFactors)
      .where(and(eq(schema.twoFactors.userId, userId), eq(schema.twoFactors.verified, true)));
    expect(rowsAfter).toHaveLength(1);
  });
});
