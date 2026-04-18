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

async function makeJurisdiction(code = "EE"): Promise<string> {
  const id = newId();
  await db.insert(schema.jurisdictions).values({
    id,
    code,
    name: `Jurisdiction ${code}`,
    config: { defaultCurrency: "EUR", entityTypes: ["X"] },
  });
  return id;
}

describe("entities.financial_year_start_month CHECK", () => {
  it("rejects 0", async () => {
    const jurisdictionId = await makeJurisdiction();
    await expect(
      db.insert(schema.entities).values({
        id: newId(),
        kind: "legal",
        name: "Bad",
        jurisdictionId,
        baseCurrency: "EUR",
        financialYearStartMonth: 0,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("rejects 13", async () => {
    const jurisdictionId = await makeJurisdiction();
    await expect(
      db.insert(schema.entities).values({
        id: newId(),
        kind: "legal",
        name: "Bad",
        jurisdictionId,
        baseCurrency: "EUR",
        financialYearStartMonth: 13,
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("accepts 1 and 12", async () => {
    const jurisdictionId = await makeJurisdiction();
    await db.insert(schema.entities).values({
      id: newId(),
      kind: "legal",
      name: "Jan",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });
    await db.insert(schema.entities).values({
      id: newId(),
      kind: "legal",
      name: "Dec",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 12,
    });
  });
});

describe("entity_person_links.share_percent precision", () => {
  async function setupEntityAndPerson(): Promise<{ entityId: string; personId: string }> {
    const jurisdictionId = await makeJurisdiction();
    const entityId = newId();
    const personId = newId();
    await db.insert(schema.entities).values({
      id: entityId,
      kind: "legal",
      name: "E",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });
    await db.insert(schema.persons).values({ id: personId, legalName: "P" });
    return { entityId, personId };
  }

  it("accepts 100.0000 (sole shareholder boundary)", async () => {
    const { entityId, personId } = await setupEntityAndPerson();
    await db.insert(schema.entityPersonLinks).values({
      id: newId(),
      entityId,
      personId,
      role: "shareholder",
      sharePercent: "100.0000",
    });
  });

  it("rejects 100.0001 (numeric(7,4) overflow)", async () => {
    const { entityId, personId } = await setupEntityAndPerson();
    // Postgres 22003 = numeric_value_out_of_range. Drizzle wraps it
    // as `cause`.
    await expect(
      db.insert(schema.entityPersonLinks).values({
        id: newId(),
        entityId,
        personId,
        role: "shareholder",
        sharePercent: "1000.0001",
      }),
    ).rejects.toMatchObject({ cause: { code: "22003" } });
  });
});

describe("FK behavior", () => {
  it("deleting an entity cascades its entity_person_links", async () => {
    const jurisdictionId = await makeJurisdiction();
    const entityId = newId();
    const personId = newId();
    await db.insert(schema.entities).values({
      id: entityId,
      kind: "legal",
      name: "E",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });
    await db.insert(schema.persons).values({ id: personId, legalName: "P" });
    await db.insert(schema.entityPersonLinks).values({
      id: newId(),
      entityId,
      personId,
      role: "ceo",
    });

    await db.delete(schema.entities).where(sql`${schema.entities.id} = ${entityId}`);

    const remaining = await db
      .select()
      .from(schema.entityPersonLinks)
      .where(sql`${schema.entityPersonLinks.entityId} = ${entityId}`);
    expect(remaining).toHaveLength(0);
  });

  it("deleting a referenced person is rejected (RESTRICT)", async () => {
    const jurisdictionId = await makeJurisdiction();
    const entityId = newId();
    const personId = newId();
    await db.insert(schema.entities).values({
      id: entityId,
      kind: "legal",
      name: "E",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });
    await db.insert(schema.persons).values({ id: personId, legalName: "P" });
    await db.insert(schema.entityPersonLinks).values({
      id: newId(),
      entityId,
      personId,
      role: "ceo",
    });

    await expect(
      db.delete(schema.persons).where(sql`${schema.persons.id} = ${personId}`),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});

describe("financial_periods UNIQUE (entity_id, kind, label)", () => {
  it("rejects a duplicate label within the same entity + kind", async () => {
    const jurisdictionId = await makeJurisdiction();
    const entityId = newId();
    await db.insert(schema.entities).values({
      id: entityId,
      kind: "legal",
      name: "E",
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });

    const start = new Date("2024-01-01T00:00:00Z");
    const end = new Date("2024-12-31T23:59:59Z");

    await db.insert(schema.financialPeriods).values({
      id: newId(),
      entityId,
      kind: "year",
      label: "FY2024",
      startAt: start,
      endAt: end,
    });

    await expect(
      db.insert(schema.financialPeriods).values({
        id: newId(),
        entityId,
        kind: "year",
        label: "FY2024",
        startAt: start,
        endAt: end,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("jurisdictions.code UNIQUE", () => {
  it("rejects a second jurisdiction with the same code", async () => {
    await db.insert(schema.jurisdictions).values({
      id: newId(),
      code: "EE",
      name: "Estonia",
      config: {},
    });
    await expect(
      db.insert(schema.jurisdictions).values({
        id: newId(),
        code: "EE",
        name: "Estonia (dup)",
        config: {},
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});
