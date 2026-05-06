import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { listCategories } from "@/domains/categories";
import { createEntity } from "@/domains/entities";
import { prefilledJurisdictions } from "@/lib/jurisdictions";

import { makeTestHarness, truncateAll, type TestHarness } from "../../__tests__/test-utils";

let h: TestHarness;

beforeAll(async () => {
  h = await makeTestHarness();
});

afterAll(async () => {
  await h.client.end();
});

beforeEach(async () => {
  await truncateAll(h.db);
  await h.seedAdmin();
});

/**
 * Insert a real prefilled jurisdiction (Estonia, Finland, US-DE) — not
 * the test harness's stub — so the end-to-end seeding path runs against
 * the actual configs that ship with the app.
 */
async function seedPrefilledJurisdiction(code: string): Promise<string> {
  const j = prefilledJurisdictions.find((p) => p.code === code);
  if (!j) throw new Error(`unknown prefilled jurisdiction: ${code}`);
  const id = newId();
  await h.db.insert(schema.jurisdictions).values({
    id,
    code: j.code,
    name: j.name,
    config: j.config,
    freeformContextMd: j.freeformContextMd,
  });
  return id;
}

describe("default category seeding on entity creation", () => {
  for (const code of ["EE", "FI", "US-DE"]) {
    it(`seeds ${code} expense defaults onto a freshly-created entity`, async () => {
      const jurisdictionId = await seedPrefilledJurisdiction(code);
      const j = prefilledJurisdictions.find((p) => p.code === code)!;
      const expectedKeys = j.config.defaultCategories.map((d) => d.key).sort();
      expect(expectedKeys.length).toBeGreaterThan(0);

      const entity = await createEntity(h.db, h.actor, {
        kind: "legal",
        name: `${code} Co`,
        // Pick the first allowed entityType from the real config so the
        // jurisdiction-type cross-check passes.
        entityType: j.config.entityTypes[0],
        jurisdictionId,
        baseCurrency: j.config.defaultCurrency,
        financialYearStartMonth: 1,
        vatRegistered: false,
        address: {},
        metadata: {},
      });

      const cats = await listCategories(h.db, { entityId: entity.id });
      const seededKeys = cats
        .map((c) => (c.metadata as Record<string, unknown>)?.seededFromJurisdictionDefault)
        .filter((k): k is string => typeof k === "string")
        .sort();

      expect(seededKeys).toEqual(expectedKeys);
      // All seeded defaults are kind='expense' for v0.1; if a future
      // jurisdiction adds non-expense defaults this assertion will
      // helpfully fail, prompting an explicit decision.
      for (const c of cats) {
        if ((c.metadata as Record<string, unknown>)?.seededFromJurisdictionDefault) {
          expect(c.kind).toBe("expense");
          expect(c.scope).toBe("entity");
          expect(c.entityId).toBe(entity.id);
        }
      }
    });
  }

  it("does not block entity creation when defaults are absent", async () => {
    // Test harness's stub jurisdiction has no defaultCategories. The
    // entity must still be created; the categories list is empty.
    const j = await h.seedJurisdiction("EE");
    const entity = await createEntity(h.db, h.actor, {
      kind: "legal",
      name: "Empty",
      entityType: "X",
      jurisdictionId: j,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      vatRegistered: false,
      address: {},
      metadata: {},
    });
    const cats = await listCategories(h.db, { entityId: entity.id });
    expect(cats).toEqual([]);
  });

  it("creates independent default sets for two entities in the same jurisdiction", async () => {
    // Each entity gets its own copy of the defaults — editing one
    // entity's categories must not affect another's.
    const jurisdictionId = await seedPrefilledJurisdiction("EE");
    const j = prefilledJurisdictions.find((p) => p.code === "EE")!;

    const a = await createEntity(h.db, h.actor, {
      kind: "legal",
      name: "A",
      entityType: j.config.entityTypes[0],
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      vatRegistered: false,
      address: {},
      metadata: {},
    });
    const b = await createEntity(h.db, h.actor, {
      kind: "legal",
      name: "B",
      entityType: j.config.entityTypes[0],
      jurisdictionId,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      vatRegistered: false,
      address: {},
      metadata: {},
    });

    const aCats = await listCategories(h.db, { entityId: a.id });
    const bCats = await listCategories(h.db, { entityId: b.id });

    expect(aCats.length).toBe(j.config.defaultCategories.length);
    expect(bCats.length).toBe(j.config.defaultCategories.length);
    // Distinct ids — no row sharing.
    const aIds = new Set(aCats.map((c) => c.id));
    for (const c of bCats) {
      expect(aIds.has(c.id)).toBe(false);
    }
  });

  it("records an audit event but does not fail when the jurisdiction config is malformed", async () => {
    // Bypass the Zod write-side validation by inserting a deliberately
    // bad config straight into the row, then create an entity that
    // points at it. createEntity's internal seed step parses the config
    // and the parse failure is caught + audited.
    const id = newId();
    await h.db.insert(schema.jurisdictions).values({
      id,
      code: "BAD",
      name: "Bad jurisdiction",
      // Malformed: defaultCurrency must be a 3-letter string.
      config: sql`'{"defaultCurrency": "X", "entityTypes": ["X"]}'::jsonb`,
    });

    const entity = await createEntity(h.db, h.actor, {
      kind: "legal",
      name: "Resilient",
      entityType: "X",
      jurisdictionId: id,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      vatRegistered: false,
      address: {},
      metadata: {},
    });
    expect(entity.id).toBeTruthy();

    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "entity.default_categories_seed_failed"));
    expect(audit.length).toBe(1);
    expect((audit[0]!.payload as Record<string, unknown>).entityId).toBe(entity.id);
  });
});
