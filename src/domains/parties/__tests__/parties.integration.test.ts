import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  archiveParty,
  createParty,
  findPartyByLegalEntityId,
  listParties,
  unarchiveParty,
  updateParty,
} from "@/domains/parties";
import { ConflictError } from "@/domains/errors";

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

describe("createParty", () => {
  it("creates a row and audits", async () => {
    const p = await createParty(h.db, h.actor, {
      kind: "client",
      name: "Acme Inc.",
      legalEntityId: "EE123456789",
      contact: { email: "billing@acme.example" },
      taxIds: { vat: "EE123456789" },
    });

    expect(p.kind).toBe("client");
    expect(p.archivedAt).toBeNull();
    const all = await listParties(h.db, {});
    expect(all).toHaveLength(1);
  });
});

describe("updateParty / archive / unarchive", () => {
  it("toggles archive state and prevents double-archive", async () => {
    const p = await createParty(h.db, h.actor, { kind: "supplier", name: "Office World" });
    await archiveParty(h.db, h.actor, { id: p.id });
    await expect(archiveParty(h.db, h.actor, { id: p.id })).rejects.toBeInstanceOf(ConflictError);

    const after = await unarchiveParty(h.db, h.actor, p.id);
    expect(after.archivedAt).toBeNull();
  });

  it("archived parties hidden by default, visible with includeArchived", async () => {
    const live = await createParty(h.db, h.actor, { kind: "client", name: "Visible" });
    const dead = await createParty(h.db, h.actor, { kind: "client", name: "Hidden" });
    await archiveParty(h.db, h.actor, { id: dead.id });

    const active = await listParties(h.db, {});
    expect(active.map((p) => p.id)).toEqual([live.id]);

    const all = await listParties(h.db, { includeArchived: true });
    expect(all.map((p) => p.id).sort()).toEqual([live.id, dead.id].sort());
  });
});

describe("findPartyByLegalEntityId", () => {
  it("matches by (legalEntityId, kind)", async () => {
    const p = await createParty(h.db, h.actor, {
      kind: "supplier",
      name: "Same id",
      legalEntityId: "EE111",
    });
    await createParty(h.db, h.actor, {
      kind: "client",
      name: "Same id different kind",
      legalEntityId: "EE111",
    });

    const found = await findPartyByLegalEntityId(h.db, "EE111", "supplier");
    expect(found?.id).toBe(p.id);
  });

  it("returns null when nothing matches", async () => {
    const found = await findPartyByLegalEntityId(h.db, "ZZ999", "client");
    expect(found).toBeNull();
  });
});

describe("updateParty", () => {
  it("partial updates only touch supplied fields", async () => {
    const p = await createParty(h.db, h.actor, {
      kind: "client",
      name: "Original",
      contact: { email: "a@b.example" },
    });
    const updated = await updateParty(h.db, h.actor, { id: p.id, name: "Renamed" });
    expect(updated.name).toBe("Renamed");
    expect((updated.contact as Record<string, string>).email).toBe("a@b.example");
  });
});
