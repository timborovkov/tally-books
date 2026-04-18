import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import {
  archiveEntity,
  createEntity,
  getEntityById,
  linkPersonToEntity,
  listEntities,
  listPersonsForEntity,
  unarchiveEntity,
  unlinkPersonFromEntity,
  updateEntity,
} from "@/domains/entities";
import { ConflictError, ValidationError } from "@/domains/errors";
import { createPerson } from "@/domains/persons";

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

// "X" matches test-utils.ts → seedJurisdiction config (entityTypes: ["X", "Y"]).
// The service-layer validator rejects values outside that list.
async function makeEntity(jurisdictionId: string, name = "Demo"): Promise<string> {
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name,
    entityType: "X",
    jurisdictionId,
    vatRegistered: true,
    vatNumber: "EE123",
    address: { city: "Tallinn", country: "EE" },
    financialYearStartMonth: 1,
    baseCurrency: "EUR",
    metadata: {},
  });
  return e.id;
}

describe("createEntity", () => {
  it("inserts and writes audit row", async () => {
    const j = await h.seedJurisdiction("EE");
    const id = await makeEntity(j);

    const audit = await h.db.select().from(schema.auditLog);
    const actions = audit.map((r) => r.action);
    expect(actions).toContain("entity.created");
    expect(audit.find((r) => r.action === "entity.created")?.payload).toMatchObject({
      entityId: id,
      kind: "legal",
    });
  });

  it("rejects unknown jurisdiction with ValidationError", async () => {
    await expect(
      createEntity(h.db, h.actor, {
        kind: "legal",
        name: "Bad",
        jurisdictionId: "nope",
        baseCurrency: "EUR",
        financialYearStartMonth: 1,
        metadata: {},
        address: {},
        vatRegistered: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects entityType not in the jurisdiction's allowed list", async () => {
    const j = await h.seedJurisdiction("EE");
    await expect(
      createEntity(h.db, h.actor, {
        kind: "legal",
        name: "Bad",
        entityType: "OU", // not in seed's ["X", "Y"]
        jurisdictionId: j,
        baseCurrency: "EUR",
        financialYearStartMonth: 1,
        metadata: {},
        address: {},
        vatRegistered: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a null entityType regardless of jurisdiction (e.g., for personal pseudo-entity)", async () => {
    const j = await h.seedJurisdiction("EE");
    const created = await createEntity(h.db, h.actor, {
      kind: "personal",
      name: "Personal",
      jurisdictionId: j,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      metadata: {},
      address: {},
      vatRegistered: false,
    });
    expect(created.entityType).toBeNull();
  });
});

describe("listEntities & archive", () => {
  it("returns each row with a nested jurisdiction object (id, code, name)", async () => {
    // The settings list page renders `row.jurisdiction.name` / `.code`
    // directly — this test locks the joined shape so a future refactor
    // that drops the inner join would fail here instead of crashing
    // server-rendered pages.
    const j = await h.seedJurisdiction("EE");
    await makeEntity(j, "Demo");

    const [row] = await listEntities(h.db);
    expect(row).toBeDefined();
    expect(row?.jurisdiction).toMatchObject({ id: j, code: "EE" });
    expect(typeof row?.jurisdiction.name).toBe("string");
  });

  it("excludes archived by default and includes them when asked", async () => {
    const j = await h.seedJurisdiction("EE");
    const a = await makeEntity(j, "Active");
    const b = await makeEntity(j, "Archived");
    await archiveEntity(h.db, h.actor, b);

    const def = await listEntities(h.db);
    expect(def.map((r) => r.id).sort()).toEqual([a].sort());

    const all = await listEntities(h.db, { includeArchived: true });
    expect(all.map((r) => r.id).sort()).toEqual([a, b].sort());
  });

  it("unarchive restores visibility", async () => {
    const j = await h.seedJurisdiction("EE");
    const id = await makeEntity(j);
    await archiveEntity(h.db, h.actor, id);
    await unarchiveEntity(h.db, h.actor, id);
    const def = await listEntities(h.db);
    expect(def.map((r) => r.id)).toContain(id);
  });
});

describe("updateEntity", () => {
  it("changes name and base currency", async () => {
    const j = await h.seedJurisdiction("EE");
    const id = await makeEntity(j);
    const updated = await updateEntity(h.db, h.actor, {
      id,
      name: "Renamed",
      baseCurrency: "USD",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.baseCurrency).toBe("USD");
  });

  it("rejects unknown jurisdiction on update", async () => {
    const j = await h.seedJurisdiction("EE");
    const id = await makeEntity(j);
    await expect(
      updateEntity(h.db, h.actor, { id, jurisdictionId: "missing" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects updating entityType to a value not allowed by the jurisdiction", async () => {
    const j = await h.seedJurisdiction("EE");
    const id = await makeEntity(j);
    await expect(updateEntity(h.db, h.actor, { id, entityType: "OU" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects switching jurisdiction when the entity's existing entityType isn't allowed there", async () => {
    // Entity is set up with entityType "X" in the EE seed. Switching to
    // a jurisdiction whose config only allows "Z" must reject — the
    // existing value can't carry over silently.
    const ee = await h.seedJurisdiction("EE");
    const id = await makeEntity(ee);
    const fi = newId();
    await h.db.insert(schema.jurisdictions).values({
      id: fi,
      code: "FI",
      name: "Finland",
      config: {
        defaultCurrency: "EUR",
        entityTypes: ["Z"],
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
    await expect(updateEntity(h.db, h.actor, { id, jurisdictionId: fi })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("linkPersonToEntity / unlink", () => {
  it("link creates a row with valid_to null and writes audit", async () => {
    const j = await h.seedJurisdiction("EE");
    const entityId = await makeEntity(j);
    const person = await createPerson(h.db, h.actor, { legalName: "Tim B" });

    const link = await linkPersonToEntity(h.db, h.actor, {
      entityId,
      personId: person.id,
      role: "ceo",
      sharePercent: 100,
      metadata: {},
    });
    expect(link.validTo).toBeNull();
    expect(link.sharePercent).toBe("100.0000");

    const active = await listPersonsForEntity(h.db, entityId);
    expect(active).toHaveLength(1);
    expect(active[0]?.person.id).toBe(person.id);
  });

  it("unlink sets valid_to and removes from active list", async () => {
    const j = await h.seedJurisdiction("EE");
    const entityId = await makeEntity(j);
    const person = await createPerson(h.db, h.actor, { legalName: "Tim B" });
    const link = await linkPersonToEntity(h.db, h.actor, {
      entityId,
      personId: person.id,
      role: "ceo",
      metadata: {},
    });
    await unlinkPersonFromEntity(h.db, h.actor, link.id);

    const stillThere = await h.db
      .select()
      .from(schema.entityPersonLinks)
      .where(eq(schema.entityPersonLinks.id, link.id));
    expect(stillThere[0]?.validTo).not.toBeNull();

    const active = await listPersonsForEntity(h.db, entityId);
    expect(active).toHaveLength(0);
  });

  it("rejects NaN sharePercent at the schema layer (ZodError), not Postgres", async () => {
    // Server actions parse FormData with Number.parseFloat, which
    // yields NaN for non-numeric input. The Zod `.finite()` constraint
    // catches that before it reaches numeric(7,4) and turns into an
    // opaque driver error.
    const j = await h.seedJurisdiction("EE");
    const entityId = await makeEntity(j);
    const person = await createPerson(h.db, h.actor, { legalName: "Tim B" });
    await expect(
      linkPersonToEntity(h.db, h.actor, {
        entityId,
        personId: person.id,
        role: "shareholder",
        sharePercent: Number.NaN,
        metadata: {},
      }),
    ).rejects.toThrowError(/finite|nan|number/i);
  });

  it("unlink twice raises ConflictError on the second call", async () => {
    const j = await h.seedJurisdiction("EE");
    const entityId = await makeEntity(j);
    const person = await createPerson(h.db, h.actor, { legalName: "Tim B" });
    const link = await linkPersonToEntity(h.db, h.actor, {
      entityId,
      personId: person.id,
      role: "ceo",
      metadata: {},
    });
    await unlinkPersonFromEntity(h.db, h.actor, link.id);
    await expect(unlinkPersonFromEntity(h.db, h.actor, link.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("getEntityById", () => {
  it("returns entity + jurisdiction + active links", async () => {
    const j = await h.seedJurisdiction("EE");
    const entityId = await makeEntity(j);
    const person = await createPerson(h.db, h.actor, { legalName: "Tim B" });
    await linkPersonToEntity(h.db, h.actor, {
      entityId,
      personId: person.id,
      role: "ceo",
      metadata: {},
    });

    const detail = await getEntityById(h.db, entityId);
    expect(detail).not.toBeNull();
    expect(detail?.jurisdiction.code).toBe("EE");
    expect(detail?.links).toHaveLength(1);
  });

  it("returns null for missing", async () => {
    expect(await getEntityById(h.db, "nope")).toBeNull();
  });
});
