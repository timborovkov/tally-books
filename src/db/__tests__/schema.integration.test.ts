import path from "node:path";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set for integration tests. " +
      "Locally: `docker compose up -d postgres` and copy .env.example → .env. " +
      "CI sets it on the integration job.",
  );
}

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
  // Wipe all data tables between tests. RESTART IDENTITY is a no-op on
  // text PKs but kept for safety; CASCADE is unnecessary because the
  // truncate hits every FK target in the same statement.
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log,
      edit_sessions,
      permissions,
      invites,
      sessions,
      two_factors,
      verifications,
      accounts,
      financial_periods,
      entity_person_links,
      entities,
      persons,
      jurisdictions,
      users
    RESTART IDENTITY CASCADE
  `);
});

describe("enums", () => {
  const expected: Record<string, string[]> = {
    thing_state: ["draft", "ready", "sent", "filed", "amending", "void"],
    actor_kind: ["user", "system"],
    thing_type: [
      "invoice",
      "expense",
      "receipt",
      "vat_declaration",
      "annual_report",
      "income_tax_return",
      "balance_sheet",
      "budget",
      "trip",
      "trip_report",
      "commute_mileage_claim",
      "employer_benefit_enrollment",
      "compliance_task",
      "payroll_run",
      "scenario",
      "billing_arrangement",
    ],
    user_role: ["admin", "member"],
    entity_kind: ["legal", "personal"],
    period_kind: ["month", "quarter", "year", "custom"],
    resource_type: [
      "invoices",
      "expenses",
      "receipts",
      "payouts",
      "taxes",
      "filings",
      "legal_documents",
      "estimates",
      "budgets",
      "reports",
      "trips",
      "benefits",
      "travel_compensation",
      "compliance_tasks",
      "agents",
      "business_details",
      "personal_details",
    ],
    access_level: ["read", "write"],
  };

  for (const [name, values] of Object.entries(expected)) {
    it(`${name} has the spec values in order`, async () => {
      const rows = await db.execute<{ enumlabel: string }>(sql`
        SELECT enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        WHERE typname = ${name}
        ORDER BY enumsortorder
      `);
      expect(rows.map((r) => r.enumlabel)).toEqual(values);
    });
  }
});

describe("tables", () => {
  it("creates all v0.1 tables", async () => {
    const rows = await db.execute<{ tablename: string }>(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    const names = new Set(rows.map((r) => r.tablename));
    for (const t of [
      "users",
      "sessions",
      "invites",
      "permissions",
      "edit_sessions",
      "audit_log",
      "jurisdictions",
      "persons",
      "entities",
      "entity_person_links",
      "financial_periods",
    ]) {
      expect(names.has(t)).toBe(true);
    }
  });
});

describe("indexes", () => {
  it("creates the named indexes from docs/data-model.md §16", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    for (const idx of [
      "users_active_idx",
      "sessions_user_expires_idx",
      "invites_email_accepted_idx",
      "permissions_active_user_idx",
      "edit_sessions_heartbeat_idx",
      "audit_log_thing_at_idx",
      "audit_log_actor_at_idx",
      "audit_log_at_idx",
      "entities_jurisdiction_idx",
      "entities_active_idx",
      "entity_person_links_entity_idx",
      "entity_person_links_person_idx",
      "financial_periods_entity_kind_start_idx",
    ]) {
      expect(byName.has(idx)).toBe(true);
    }
  });

  it("entities_active_idx is partial on archived_at IS NULL", async () => {
    const [row] = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'entities_active_idx'
    `);
    expect(row?.indexdef).toMatch(/WHERE.*archived_at.*IS NULL/i);
  });

  it("users_active_idx is partial on removed_at IS NULL", async () => {
    const [row] = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'users_active_idx'
    `);
    expect(row?.indexdef).toMatch(/WHERE.*removed_at.*IS NULL/i);
  });

  it("permissions_active_user_idx is partial on revoked_at IS NULL", async () => {
    const [row] = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'permissions_active_user_idx'
    `);
    expect(row?.indexdef).toMatch(/WHERE.*revoked_at.*IS NULL/i);
  });
});

describe("users 2FA CHECK constraint", () => {
  it("rejects an active non-bootstrap user without 2FA", async () => {
    await expect(
      db.insert(schema.users).values({
        id: newId(),
        email: `bad-${newId()}@tally.local`,
        bootstrapCompletedAt: new Date(),
        twoFactorEnabledAt: null,
        removedAt: null,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("accepts a bootstrap-in-progress admin (bootstrap_completed_at NULL)", async () => {
    await db.insert(schema.users).values({
      id: newId(),
      email: `boot-${newId()}@tally.local`,
      role: "admin",
    });
  });

  it("accepts an active user with 2FA enabled", async () => {
    await db.insert(schema.users).values({
      id: newId(),
      email: `ok-${newId()}@tally.local`,
      bootstrapCompletedAt: new Date(),
      twoFactorEnabledAt: new Date(),
    });
  });
});

describe("edit_sessions one-per-thing", () => {
  it("rejects a second edit session on the same (thing_type, thing_id)", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ id: newId(), email: `editor-${newId()}@tally.local`, role: "admin" })
      .returning({ id: schema.users.id });

    if (!user) throw new Error("user insert returned no row");

    const thingId = newId();

    await db.insert(schema.editSessions).values({
      id: newId(),
      userId: user.id,
      thingType: "invoice",
      thingId,
    });

    await expect(
      db.insert(schema.editSessions).values({
        id: newId(),
        userId: user.id,
        thingType: "invoice",
        thingId,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});
