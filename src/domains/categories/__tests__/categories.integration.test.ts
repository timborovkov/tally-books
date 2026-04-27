import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCategory, getCategory, listCategories, updateCategory } from "@/domains/categories";
import { createEntity } from "@/domains/entities";
import { ConflictError, NotFoundError, ValidationError } from "@/domains/errors";

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

let cachedJurisdictionId: string | null = null;

beforeEach(() => {
  cachedJurisdictionId = null;
});

async function seedEntity(name = "Co"): Promise<string> {
  if (!cachedJurisdictionId) {
    cachedJurisdictionId = await h.seedJurisdiction("EE");
  }
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name,
    entityType: "X",
    jurisdictionId: cachedJurisdictionId,
    baseCurrency: "EUR",
    financialYearStartMonth: 1,
    vatRegistered: false,
    address: {},
    metadata: {},
  });
  return e.id;
}

describe("createCategory", () => {
  it("creates an entity-scoped expense category", async () => {
    const entityId = await seedEntity();
    const c = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Office",
      kind: "expense",
    });
    expect(c.scope).toBe("entity");
    expect(c.entityId).toBe(entityId);
    expect(c.kind).toBe("expense");
  });

  it("creates a global category with no entityId", async () => {
    const c = await createCategory(h.db, h.actor, {
      scope: "global",
      name: "Travel",
      kind: "expense",
    });
    expect(c.scope).toBe("global");
    expect(c.entityId).toBeNull();
  });

  it("rejects scope='entity' with no entityId (Zod refine)", async () => {
    await expect(
      createCategory(h.db, h.actor, {
        scope: "entity",
        name: "Office",
        kind: "expense",
      }),
    ).rejects.toThrow();
  });

  it("rejects scope='global' with an entityId (Zod refine)", async () => {
    const entityId = await seedEntity();
    await expect(
      createCategory(h.db, h.actor, {
        scope: "global",
        entityId,
        name: "Office",
        kind: "expense",
      }),
    ).rejects.toThrow();
  });

  it("rejects parent of a different kind", async () => {
    const entityId = await seedEntity();
    const incomeParent = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Income parent",
      kind: "income",
    });

    await expect(
      createCategory(h.db, h.actor, {
        scope: "entity",
        entityId,
        name: "Expense child",
        kind: "expense",
        parentId: incomeParent.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateCategory", () => {
  it("renames and toggles archive", async () => {
    const entityId = await seedEntity();
    const c = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Office",
      kind: "expense",
    });

    const renamed = await updateCategory(h.db, h.actor, { id: c.id, name: "Office supplies" });
    expect(renamed.name).toBe("Office supplies");

    const archived = await updateCategory(h.db, h.actor, { id: c.id, archive: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const unarchived = await updateCategory(h.db, h.actor, { id: c.id, archive: false });
    expect(unarchived.archivedAt).toBeNull();
  });

  it("rejects self as parent", async () => {
    const entityId = await seedEntity();
    const c = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Office",
      kind: "expense",
    });

    await expect(
      updateCategory(h.db, h.actor, { id: c.id, parentId: c.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects parent reassignment that would create a cycle", async () => {
    const entityId = await seedEntity();
    const a = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "A",
      kind: "expense",
    });
    const b = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "B",
      kind: "expense",
      parentId: a.id,
    });
    const c = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "C",
      kind: "expense",
      parentId: b.id,
    });

    // Trying to reparent A under C would close the loop A→C→B→A.
    await expect(
      updateCategory(h.db, h.actor, { id: a.id, parentId: c.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("not found", async () => {
    await expect(
      updateCategory(h.db, h.actor, { id: "nonexistent", name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listCategories", () => {
  it("returns globals + the requested entity's rows; excludes other entities", async () => {
    const entityA = await seedEntity("A");
    const entityB = await seedEntity("B");

    await createCategory(h.db, h.actor, { scope: "global", name: "Travel", kind: "expense" });
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId: entityA,
      name: "Office A",
      kind: "expense",
    });
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId: entityB,
      name: "Office B",
      kind: "expense",
    });

    const visible = await listCategories(h.db, { entityId: entityA });
    const names = visible.map((c) => c.name).sort();
    expect(names).toEqual(["Office A", "Travel"]);
  });

  it("filters by kind", async () => {
    const entityId = await seedEntity();
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Office",
      kind: "expense",
    });
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Consulting",
      kind: "income",
    });

    const expenseOnly = await listCategories(h.db, { entityId, kind: "expense" });
    expect(expenseOnly.map((c) => c.name)).toEqual(["Office"]);
  });

  it("excludes archived by default", async () => {
    const entityId = await seedEntity();
    const c = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Office",
      kind: "expense",
    });
    await updateCategory(h.db, h.actor, { id: c.id, archive: true });

    const active = await listCategories(h.db, { entityId });
    expect(active).toEqual([]);

    const all = await listCategories(h.db, { entityId, includeArchived: true });
    expect(all).toHaveLength(1);
  });
});

describe("getCategory", () => {
  it("not found", async () => {
    await expect(getCategory(h.db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
