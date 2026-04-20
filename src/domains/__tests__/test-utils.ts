import path from "node:path";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import type { CurrentActor } from "@/lib/auth-shim";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set for integration tests. " +
      "Locally: `docker compose up -d postgres` and copy .env.example → .env. " +
      "CI sets it on the integration job.",
  );
}

export type TestDb = PostgresJsDatabase<typeof schema>;

export interface TestHarness {
  db: TestDb;
  client: Sql;
  actor: CurrentActor;
  /** Seed minimal fixtures and return convenience IDs. */
  seedAdmin(): Promise<string>;
  seedJurisdiction(code?: string): Promise<string>;
}

export async function makeTestHarness(): Promise<TestHarness> {
  const client = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve("src/db/migrations") });

  const harness: TestHarness = {
    db,
    client,
    // Filled in lazily — tests that need an actor call seedAdmin() and
    // overwrite this. Default keeps the type happy.
    actor: {
      userId: "pending",
      kind: "user",
      user: { id: "pending", role: "admin", removedAt: null },
    },
    async seedAdmin() {
      const id = newId();
      await db.insert(schema.users).values({
        id,
        email: `admin-${id}@tally.test`,
        role: "admin",
      });
      harness.actor = {
        userId: id,
        kind: "user",
        user: { id, role: "admin", removedAt: null },
      };
      return id;
    },
    async seedJurisdiction(code = "EE") {
      const id = newId();
      // Minimal but schema-valid JurisdictionConfig — the entity-type
      // validator parses this with jurisdictionConfigSchema and falls
      // back to permissive when parsing fails, so omitting required
      // fields here would silently disable cross-jurisdiction
      // validation in tests. Keep this in sync with src/lib/jurisdictions/types.ts.
      await db.insert(schema.jurisdictions).values({
        id,
        code,
        name: `Jurisdiction ${code}`,
        config: {
          defaultCurrency: "EUR",
          entityTypes: ["X", "Y"],
          taxTypes: [],
          vatRules: null,
          perDiemRules: null,
          filingSchedules: [],
          portalLinks: [],
          guideLinks: [],
          payoutOptions: [],
          contributions: [],
          payoutKindDisplay: {},
        },
      });
      return id;
    },
  };
  return harness;
}

export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log,
      edit_sessions,
      receipt_versions,
      receipts,
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
}
