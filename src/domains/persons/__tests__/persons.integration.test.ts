import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { newId } from "@/db/id";
import { createEntity, linkPersonToEntity } from "@/domains/entities";
import { ConflictError, NotFoundError } from "@/domains/errors";
import {
  createPerson,
  deletePerson,
  getPersonById,
  listPersons,
  updatePerson,
} from "@/domains/persons";

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

describe("createPerson", () => {
  it("inserts a person and writes audit row", async () => {
    const p = await createPerson(h.db, h.actor, {
      legalName: "Tim B",
      taxResidency: "EE",
      ids: { isikukood: "39001011234" },
    });
    expect(p.legalName).toBe("Tim B");
    expect(p.ids).toEqual({ isikukood: "39001011234" });

    const audit = await h.db.select().from(schema.auditLog);
    expect(audit.find((r) => r.action === "person.created")).toBeDefined();
  });
});

describe("listPersons & getPersonById", () => {
  it("returns persons sorted by legal name", async () => {
    await createPerson(h.db, h.actor, { legalName: "Zed" });
    await createPerson(h.db, h.actor, { legalName: "Alice" });
    const rows = await listPersons(h.db);
    expect(rows.map((r) => r.legalName)).toEqual(["Alice", "Zed"]);
  });

  it("getPersonById returns null when missing", async () => {
    expect(await getPersonById(h.db, "nope")).toBeNull();
  });
});

describe("updatePerson", () => {
  it("changes legal name and writes audit", async () => {
    const p = await createPerson(h.db, h.actor, { legalName: "Old" });
    const updated = await updatePerson(h.db, h.actor, { id: p.id, legalName: "New" });
    expect(updated.legalName).toBe("New");
  });

  it("throws NotFoundError on unknown id", async () => {
    await expect(
      updatePerson(h.db, h.actor, { id: "nope", legalName: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("replaces contact jsonb wholesale — callers must round-trip every sub-field", async () => {
    // Document the service contract: `patch.contact = input.contact` is a
    // full replacement, not a merge. If an action forgets to pass a
    // sub-field (e.g. notes), it gets dropped. PersonForm + actions must
    // stay in sync with contactSchema.
    const p = await createPerson(h.db, h.actor, {
      legalName: "Round Trip",
      contact: { email: "tim@tally.test", phone: "+358-1", notes: "prefers email" },
    });
    expect(p.contact).toMatchObject({ email: "tim@tally.test", notes: "prefers email" });

    // Simulate an action that forgets `notes` — the existing notes get
    // wiped. This is the contract; fix is at the action/form layer.
    const updated = await updatePerson(h.db, h.actor, {
      id: p.id,
      contact: { email: "tim@tally.test", phone: "+358-1" },
    });
    expect(updated.contact).not.toHaveProperty("notes");

    // And when the action passes notes through, it survives.
    const kept = await updatePerson(h.db, h.actor, {
      id: p.id,
      contact: { email: "tim@tally.test", phone: "+358-1", notes: "v2" },
    });
    expect(kept.contact).toMatchObject({ notes: "v2" });
  });
});

describe("deletePerson", () => {
  it("deletes a stand-alone person", async () => {
    const p = await createPerson(h.db, h.actor, { legalName: "Solo" });
    await deletePerson(h.db, h.actor, p.id);
    expect(await getPersonById(h.db, p.id)).toBeNull();
  });

  it("blocks delete when active links exist (ConflictError)", async () => {
    const j = await h.seedJurisdiction("EE");
    const entity = await createEntity(h.db, h.actor, {
      kind: "legal",
      name: "OÜ",
      jurisdictionId: j,
      baseCurrency: "EUR",
      financialYearStartMonth: 1,
      address: {},
      vatRegistered: false,
      metadata: {},
    });
    const p = await createPerson(h.db, h.actor, { legalName: "Linked" });
    await linkPersonToEntity(h.db, h.actor, {
      entityId: entity.id,
      personId: p.id,
      role: "ceo",
      metadata: {},
    });

    await expect(deletePerson(h.db, h.actor, p.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await getPersonById(h.db, p.id)).not.toBeNull();
  });

  it("blocks delete when person is linked to a platform user", async () => {
    const userId = newId();
    await h.db.insert(schema.users).values({
      id: userId,
      email: `member-${userId}@tally.test`,
      role: "member",
    });
    const p = await createPerson(h.db, h.actor, { legalName: "User", userId });
    await expect(deletePerson(h.db, h.actor, p.id)).rejects.toBeInstanceOf(ConflictError);
  });
});
