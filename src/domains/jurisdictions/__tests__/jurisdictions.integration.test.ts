import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  createJurisdiction,
  deleteJurisdiction,
  getJurisdictionByCode,
  listJurisdictions,
  updateJurisdiction,
} from "@/domains/jurisdictions";
import { ConflictError, NotFoundError } from "@/domains/errors";

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

const validConfig = {
  defaultCurrency: "EUR",
  entityTypes: ["OU"],
  taxTypes: [],
  vatRules: null,
  perDiemRules: null,
  filingSchedules: [],
  portalLinks: [],
  guideLinks: [],
  payoutOptions: [],
  contributions: [],
  payoutKindDisplay: {},
};

describe("createJurisdiction", () => {
  it("inserts and writes an audit_log row", async () => {
    const j = await createJurisdiction(h.db, h.actor, {
      code: "EE",
      name: "Estonia",
      config: validConfig,
    });
    expect(j.code).toBe("EE");

    const audit = await h.db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("jurisdiction.created");
  });

  it("rejects a duplicate code with ConflictError, not a raw 23505", async () => {
    await createJurisdiction(h.db, h.actor, { code: "EE", name: "Estonia", config: validConfig });
    await expect(
      createJurisdiction(h.db, h.actor, { code: "EE", name: "Dup", config: validConfig }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("updateJurisdiction", () => {
  it("updates name and writes audit row", async () => {
    const created = await createJurisdiction(h.db, h.actor, {
      code: "EE",
      name: "Estonia",
      config: validConfig,
    });
    const updated = await updateJurisdiction(h.db, h.actor, { id: created.id, name: "Eesti" });
    expect(updated.name).toBe("Eesti");

    const audit = await h.db.select().from(schema.auditLog);
    expect(audit.map((r) => r.action)).toEqual(["jurisdiction.created", "jurisdiction.updated"]);
  });

  it("throws NotFoundError on unknown id", async () => {
    await expect(
      updateJurisdiction(h.db, h.actor, { id: "nope", name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteJurisdiction", () => {
  it("deletes when no entities reference it", async () => {
    const j = await createJurisdiction(h.db, h.actor, {
      code: "EE",
      name: "Estonia",
      config: validConfig,
    });
    await deleteJurisdiction(h.db, h.actor, j.id);
    expect(await getJurisdictionByCode(h.db, "EE")).toBeNull();
  });

  it("throws ConflictError when at least one entity points at it", async () => {
    const j = await createJurisdiction(h.db, h.actor, {
      code: "EE",
      name: "Estonia",
      config: validConfig,
    });
    await h.db.insert(schema.entities).values({
      id: "ent-1",
      kind: "legal",
      name: "OÜ X",
      jurisdictionId: j.id,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
    });
    await expect(deleteJurisdiction(h.db, h.actor, j.id)).rejects.toBeInstanceOf(ConflictError);

    // Still there.
    const [still] = await h.db
      .select()
      .from(schema.jurisdictions)
      .where(eq(schema.jurisdictions.id, j.id));
    expect(still).toBeDefined();
  });
});

describe("listJurisdictions", () => {
  it("returns rows alphabetically by name", async () => {
    await createJurisdiction(h.db, h.actor, { code: "FI", name: "Finland", config: validConfig });
    await createJurisdiction(h.db, h.actor, { code: "EE", name: "Estonia", config: validConfig });
    const rows = await listJurisdictions(h.db);
    expect(rows.map((r) => r.code)).toEqual(["EE", "FI"]);
  });
});
