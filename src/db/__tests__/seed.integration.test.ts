import path from "node:path";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { prefilledJurisdictions } from "@/lib/jurisdictions";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for integration tests.");
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
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log,
      edit_sessions,
      permissions,
      invites,
      sessions,
      financial_periods,
      entity_person_links,
      entities,
      persons,
      jurisdictions,
      users
    RESTART IDENTITY CASCADE
  `);
});

describe("seed()", () => {
  it("creates the bootstrap admin, three jurisdictions, and the personal pseudo-entity", async () => {
    const report = await seed(db);
    expect(report.adminCreated).toBe(true);
    expect(report.jurisdictionsCreated).toBe(prefilledJurisdictions.length);
    expect(report.personalEntityCreated).toBe(true);

    const jRows = await db.select({ code: schema.jurisdictions.code }).from(schema.jurisdictions);
    expect(jRows.map((r) => r.code).sort()).toEqual(
      prefilledJurisdictions.map((p) => p.code).sort(),
    );

    const ents = await db.select().from(schema.entities);
    expect(ents).toHaveLength(1);
    expect(ents[0]?.kind).toBe("personal");
    expect(ents[0]?.metadata).toMatchObject({ seed: "bootstrap_personal" });
  });

  it("is idempotent — running twice creates nothing the second time", async () => {
    await seed(db);
    const second = await seed(db);
    expect(second.adminCreated).toBe(false);
    expect(second.jurisdictionsCreated).toBe(0);
    expect(second.personalEntityCreated).toBe(false);

    const ents = await db.select().from(schema.entities);
    expect(ents).toHaveLength(1);
    const jRows = await db.select().from(schema.jurisdictions);
    expect(jRows).toHaveLength(prefilledJurisdictions.length);
  });
});
