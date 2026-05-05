import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { invoices, parties } from "@/db/schema";
import { createEntity } from "@/domains/entities";
import { ConflictError, NotFoundError, ValidationError } from "@/domains/errors";
import {
  computeInvoiceTotals,
  createInternalInvoice,
  createInvoice,
  getInvoiceAuditEntries,
  getInvoiceHistory,
  listInvoices,
  markInvoicePaid,
  markInvoiceUnpaid,
  transitionInvoice,
  updateInvoice,
} from "@/domains/invoices";
import { archiveParty, createParty } from "@/domains/parties";

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

async function seedEntity(name = "Demo OÜ", businessId: string | null = null): Promise<string> {
  if (!cachedJurisdictionId) cachedJurisdictionId = await h.seedJurisdiction("EE");
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name,
    entityType: "X",
    jurisdictionId: cachedJurisdictionId,
    baseCurrency: "EUR",
    financialYearStartMonth: 1,
    vatRegistered: false,
    businessId: businessId ?? undefined,
    address: {},
    metadata: {},
  });
  return e.id;
}

async function seedClient(name = "Acme Inc."): Promise<string> {
  const p = await createParty(h.db, h.actor, { kind: "client", name });
  return p.id;
}

describe("computeInvoiceTotals", () => {
  it("sums quantity × unitPrice plus VAT per line", () => {
    const totals = computeInvoiceTotals([
      { description: "A", quantity: "2", unitPrice: "100", vatRate: "0.24" },
      { description: "B", quantity: "1.5", unitPrice: "50" },
    ]);
    expect(totals.subtotal).toBe("275.0000");
    expect(totals.vatTotal).toBe("48.0000");
    expect(totals.total).toBe("323.0000");
  });
});

describe("createInvoice", () => {
  it("creates parent + version 1, computes totals, defaults to draft", async () => {
    const entityId = await seedEntity();
    const clientId = await seedClient();

    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      clientId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "Consulting", quantity: "10", unitPrice: "100", vatRate: "0.24" }],
    });

    expect(inv.state).toBe("draft");
    expect(inv.number).toBeNull();
    expect(inv.total).toBe("1240.0000");
    expect(inv.vatTotal).toBe("240.0000");
    expect(inv.currentVersionId).toBeTruthy();

    const history = await getInvoiceHistory(h.db, inv.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.version.versionNum).toBe(1);
    expect(history[0]?.version.diff).toEqual([]);
  });
});

describe("updateInvoice", () => {
  it("re-computes totals when line items change and writes a diff", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      lineItems: [{ description: "A", quantity: "1", unitPrice: "100" }],
    });

    const next = await updateInvoice(h.db, h.actor, {
      id: inv.id,
      lineItems: [
        { description: "A", quantity: "1", unitPrice: "100" },
        { description: "B", quantity: "2", unitPrice: "50", vatRate: "0.20" },
      ],
      reason: "added line",
    });

    expect(next.total).toBe("220.0000");
    expect(next.vatTotal).toBe("20.0000");

    const history = await getInvoiceHistory(h.db, inv.id);
    expect(history).toHaveLength(2);
    expect(history[1]?.version.semanticSummary).toBe("added line");
  });
});

describe("transitionInvoice", () => {
  it("draft → ready assigns sequential numbers per (entity, year)", async () => {
    const entityId = await seedEntity();
    const a = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    const b = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      issueDate: new Date("2026-05-20T00:00:00Z"),
      lineItems: [{ description: "y", quantity: "1", unitPrice: "10" }],
    });

    const aReady = await transitionInvoice(h.db, h.actor, { id: a.id, nextState: "ready" });
    const bReady = await transitionInvoice(h.db, h.actor, { id: b.id, nextState: "ready" });
    expect(aReady.number).toBe("INV-2026-0001");
    expect(bReady.number).toBe("INV-2026-0002");
  });

  it("ready → draft drops the number; re-promotion yields a fresh seq", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    const ready = await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "ready" });
    expect(ready.number).toBe("INV-2026-0001");
    const back = await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "draft" });
    expect(back.number).toBeNull();
    const ready2 = await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "ready" });
    // Counter does not roll back — fresh sequence number.
    expect(ready2.number).toBe("INV-2026-0002");
  });

  it("ready → sent stamps sentAt", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "ready" });
    const sent = await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "sent" });
    expect(sent.sentAt).toBeInstanceOf(Date);
  });

  it("rejects illegal transitions", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    await expect(
      transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "filed" }),
    ).rejects.toThrow();
  });
});

describe("markInvoicePaid / markInvoiceUnpaid", () => {
  it("marks paid then unpaid; double-mark errors", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "ready" });
    await transitionInvoice(h.db, h.actor, { id: inv.id, nextState: "sent" });

    const paid = await markInvoicePaid(h.db, h.actor, {
      id: inv.id,
      paidAt: new Date("2026-05-15T00:00:00Z"),
      paymentRef: "bank-tx-1",
    });
    expect(paid.paidAt?.toISOString()).toBe("2026-05-15T00:00:00.000Z");
    expect(paid.paymentRef).toBe("bank-tx-1");

    await expect(markInvoicePaid(h.db, h.actor, { id: inv.id })).rejects.toBeInstanceOf(
      ConflictError,
    );

    const unpaid = await markInvoiceUnpaid(h.db, h.actor, { id: inv.id });
    expect(unpaid.paidAt).toBeNull();
  });

  it("paying a draft errors", async () => {
    const entityId = await seedEntity();
    const inv = await createInvoice(h.db, h.actor, {
      entityId,
      currency: "EUR",
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
    });
    await expect(markInvoicePaid(h.db, h.actor, { id: inv.id })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("createInternalInvoice", () => {
  it("creates two cross-linked invoices in one transaction", async () => {
    const sellerId = await seedEntity("Toiminimi", "FI12345678");
    const buyerId = await seedEntity("Holding OÜ", "EE99887766");

    const { seller, buyer } = await createInternalInvoice(h.db, h.actor, {
      sellerEntityId: sellerId,
      buyerEntityId: buyerId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [
        { description: "Service fee", quantity: "1", unitPrice: "1000", vatRate: "0.24" },
      ],
    });

    expect(seller.entityId).toBe(sellerId);
    expect(buyer.entityId).toBe(buyerId);
    expect(seller.mirrorInvoiceId).toBe(buyer.id);
    expect(buyer.mirrorInvoiceId).toBe(seller.id);
    expect(seller.total).toBe("1240.0000");
    expect(buyer.total).toBe("1240.0000");

    // Each entity sees only its own side in the list.
    const list = await listInvoices(h.db, { entityIds: [sellerId] });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?.id).toBe(seller.id);

    // Audit: both rows have an `invoice.created` audit entry with a
    // payload referring to the other side.
    const sellerAudit = await getInvoiceAuditEntries(h.db, seller.id);
    expect(sellerAudit[0]?.payload).toMatchObject({ mirroredFrom: buyer.id, role: "seller" });

    // Mirror parties exist: the buyer is `kind=client` in seller's books,
    // the seller is `kind=supplier` in buyer's books.
    const sellerParty = seller.clientId
      ? (await h.db.select().from(invoices).where(eq(invoices.id, seller.id)))[0]
      : null;
    expect(sellerParty?.clientId).toBeTruthy();
  });

  it("does not reuse archived mirror parties", async () => {
    const sellerId = await seedEntity("Toiminimi", "FI12345678");
    const buyerId = await seedEntity("Holding OÜ", "EE99887766");

    // Pre-create + archive a party that would otherwise match the
    // mirror lookup (both legal_entity_id and the metadata fallback).
    const stale = await createParty(h.db, h.actor, {
      kind: "client",
      name: "Stale Holding OÜ",
      legalEntityId: "EE99887766",
      metadata: { mirroredEntityId: buyerId },
    });
    await archiveParty(h.db, h.actor, { id: stale.id });

    const { seller } = await createInternalInvoice(h.db, h.actor, {
      sellerEntityId: sellerId,
      buyerEntityId: buyerId,
      currency: "EUR",
      issueDate: new Date("2026-04-20T00:00:00Z"),
      lineItems: [{ description: "Service fee", quantity: "1", unitPrice: "100" }],
    });

    expect(seller.clientId).toBeTruthy();
    expect(seller.clientId).not.toBe(stale.id);
    const [linked] = await h.db.select().from(parties).where(eq(parties.id, seller.clientId!));
    expect(linked?.archivedAt).toBeNull();
  });

  it("rejects same-entity internal invoice", async () => {
    const id = await seedEntity();
    await expect(
      createInternalInvoice(h.db, h.actor, {
        sellerEntityId: id,
        buyerEntityId: id,
        currency: "EUR",
        lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects unknown entity", async () => {
    const sellerId = await seedEntity();
    await expect(
      createInternalInvoice(h.db, h.actor, {
        sellerEntityId: sellerId,
        buyerEntityId: "ent_does_not_exist",
        currency: "EUR",
        lineItems: [{ description: "x", quantity: "1", unitPrice: "10" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
