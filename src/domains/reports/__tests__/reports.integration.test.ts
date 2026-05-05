import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCategory } from "@/domains/categories";
import { createEntity } from "@/domains/entities";
import { createExpense, transitionExpense } from "@/domains/expenses";
import { createInvoice, markInvoicePaid, transitionInvoice } from "@/domains/invoices";
import { createParty } from "@/domains/parties";
import {
  getCashFlow,
  getExpenseStatement,
  getIncomeStatement,
  getJournal,
} from "@/domains/reports";
import { fiscalYearFromStartYear, monthsInFiscalYear } from "@/lib/fiscal-year";

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

async function seedEntity(name = "Demo OÜ"): Promise<string> {
  if (!cachedJurisdictionId) cachedJurisdictionId = await h.seedJurisdiction("EE");
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

async function seedClient(name = "Acme"): Promise<string> {
  const c = await createParty(h.db, h.actor, {
    kind: "client",
    name,
    contact: {},
    taxIds: {},
    defaultTerms: {},
    metadata: {},
  });
  return c.id;
}

const FY2026 = fiscalYearFromStartYear(2026, 1);
const MONTHS = monthsInFiscalYear(FY2026);

/**
 * Seed a representative dataset for FY2026:
 *  - 3 expenses across 2 categories in 2 different months
 *  - 1 expense in a void state (must be excluded from totals)
 *  - 2 invoices: one paid in March, one sent and unpaid
 *  - 1 invoice in void state (excluded)
 */
async function seedTypicalDataset(entityId: string): Promise<{
  catA: string;
  catB: string;
  clientId: string;
}> {
  const catA = (
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Software",
      kind: "expense",
    })
  ).id;
  const catB = (
    await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Rent",
      kind: "expense",
    })
  ).id;
  const clientId = await seedClient();

  // Expenses: 100 + 200 in catA (Feb), 1000 in catB (March), 50 void in Jan.
  await createExpense(h.db, h.actor, {
    entityId,
    categoryId: catA,
    occurredAt: new Date("2026-02-10T00:00:00Z"),
    amount: "100",
    currency: "EUR",
  });
  await createExpense(h.db, h.actor, {
    entityId,
    categoryId: catA,
    occurredAt: new Date("2026-02-20T00:00:00Z"),
    amount: "200",
    currency: "EUR",
  });
  await createExpense(h.db, h.actor, {
    entityId,
    categoryId: catB,
    occurredAt: new Date("2026-03-15T00:00:00Z"),
    amount: "1000",
    currency: "EUR",
  });
  const voided = await createExpense(h.db, h.actor, {
    entityId,
    categoryId: catA,
    occurredAt: new Date("2026-01-05T00:00:00Z"),
    amount: "50",
    currency: "EUR",
  });
  await transitionExpense(h.db, h.actor, { id: voided.id, nextState: "void" });

  // Invoices: paid 500 in March, unpaid 750 issued April, voided 999.
  const inv1 = await createInvoice(h.db, h.actor, {
    entityId,
    clientId,
    issueDate: new Date("2026-03-01T00:00:00Z"),
    currency: "EUR",
    lineItems: [
      { description: "Service", quantity: "1", unitPrice: "500", unit: "h", vatRate: "0" },
    ],
  });
  await transitionInvoice(h.db, h.actor, { id: inv1.id, nextState: "ready" });
  await transitionInvoice(h.db, h.actor, { id: inv1.id, nextState: "sent" });
  await markInvoicePaid(h.db, h.actor, {
    id: inv1.id,
    paidAt: new Date("2026-03-20T00:00:00Z"),
  });

  const inv2 = await createInvoice(h.db, h.actor, {
    entityId,
    clientId,
    issueDate: new Date("2026-04-05T00:00:00Z"),
    currency: "EUR",
    lineItems: [
      { description: "Consulting", quantity: "1", unitPrice: "750", unit: "h", vatRate: "0" },
    ],
  });
  await transitionInvoice(h.db, h.actor, { id: inv2.id, nextState: "ready" });
  await transitionInvoice(h.db, h.actor, { id: inv2.id, nextState: "sent" });

  const invVoid = await createInvoice(h.db, h.actor, {
    entityId,
    clientId,
    issueDate: new Date("2026-03-05T00:00:00Z"),
    currency: "EUR",
    lineItems: [{ description: "X", quantity: "1", unitPrice: "999", unit: "h", vatRate: "0" }],
  });
  await transitionInvoice(h.db, h.actor, { id: invVoid.id, nextState: "void" });

  return { catA, catB, clientId };
}

describe("getIncomeStatement", () => {
  it("aggregates revenue (invoices) + expenses by month, excluding void and mirror invoices", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);

    const statement = await getIncomeStatement(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      months: MONTHS,
    });

    const byMonth = new Map(statement.buckets.map((b) => [b.period, b]));
    expect(byMonth.size).toBe(12);

    // Feb: 300 expense, no revenue. Net = -300.
    const feb = byMonth.get("2026-02")!;
    expect(feb.currencies).toEqual([
      { currency: "EUR", revenue: "0", expense: "300.0000", net: "-300.0000" },
    ]);

    // March: 500 revenue (paid invoice — income statement uses issueDate
    // so paid status doesn't matter), 1000 expense. Net = -500. Void
    // invoice at 999 EUR must NOT appear.
    const mar = byMonth.get("2026-03")!;
    expect(mar.currencies).toEqual([
      { currency: "EUR", revenue: "500.0000", expense: "1000.0000", net: "-500.0000" },
    ]);

    // April: unpaid invoice 750 still counts as revenue (issued).
    const apr = byMonth.get("2026-04")!;
    expect(apr.currencies).toEqual([
      { currency: "EUR", revenue: "750.0000", expense: "0", net: "750.0000" },
    ]);

    // January: voided expense excluded → empty.
    const jan = byMonth.get("2026-01")!;
    expect(jan.currencies).toEqual([]);
  });

  it("returns dense empty buckets when no data", async () => {
    const entityId = await seedEntity();
    const statement = await getIncomeStatement(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      months: MONTHS,
    });
    expect(statement.buckets).toHaveLength(12);
    for (const b of statement.buckets) {
      expect(b.currencies).toEqual([]);
    }
  });
});

describe("getExpenseStatement", () => {
  it("groups expenses by category, excludes void, sorts largest first", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);

    const rows = await getExpenseStatement(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
    });

    expect(rows.map((r) => ({ name: r.categoryName, total: r.total }))).toEqual([
      { name: "Rent", total: "1000.0000" },
      { name: "Software", total: "300.0000" },
    ]);
  });

  it("buckets uncategorized expenses under 'Uncategorized'", async () => {
    const entityId = await seedEntity();
    await createExpense(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-02-10T00:00:00Z"),
      amount: "42",
      currency: "EUR",
    });
    const rows = await getExpenseStatement(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
    });
    expect(rows).toEqual([
      { categoryId: null, categoryName: "Uncategorized", currency: "EUR", total: "42.0000" },
    ]);
  });
});

describe("getCashFlow", () => {
  it("uses paidAt for inflows; expenses.occurredAt for outflows; excludes void invoices", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);

    const buckets = await getCashFlow(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      months: MONTHS,
    });

    const byMonth = new Map(buckets.map((b) => [b.period, b]));

    // Inv1 paid in March: 500 EUR inflow. Inv2 unpaid → no inflow at all.
    // 1000 expense outflow same month → net = -500.
    const mar = byMonth.get("2026-03")!;
    expect(mar.currencies).toEqual([
      { currency: "EUR", inflow: "500.0000", outflow: "1000.0000", net: "-500.0000" },
    ]);

    // April: no inflow (inv2 unpaid). No outflow either → empty.
    const apr = byMonth.get("2026-04")!;
    expect(apr.currencies).toEqual([]);
  });
});

describe("getJournal", () => {
  it("merges expenses, invoices, and receipts in date-desc order", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);

    const { rows, total } = await getJournal(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      limit: 100,
      offset: 0,
    });

    // Sources visible: expenses (3 active + 1 void = 4) + invoices (2 active + 1 void = 3) = 7.
    expect(total).toBe(7);
    // Newest first: April invoice → March invoice (paid) → March void invoice → March expense → Feb expenses → Jan void expense.
    expect(rows[0]!.date.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    // Void rows present so the journal stays an honest record.
    const voidStates = rows.filter((r) => r.state === "void");
    expect(voidStates.length).toBe(2);
  });

  it("filters by source", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);

    const { rows } = await getJournal(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      sources: ["invoice"],
      limit: 100,
      offset: 0,
    });
    expect(rows.every((r) => r.source === "invoice")).toBe(true);
  });

  it("paginates", async () => {
    const entityId = await seedEntity();
    await seedTypicalDataset(entityId);
    const page1 = await getJournal(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      limit: 2,
      offset: 0,
    });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(7);
    const page2 = await getJournal(h.db, h.actor, {
      entityIds: [entityId],
      from: FY2026.startUtc,
      to: FY2026.endUtc,
      limit: 2,
      offset: 2,
    });
    expect(page2.rows).toHaveLength(2);
    // No overlap.
    const ids1 = new Set(page1.rows.map((r) => `${r.source}-${r.id}`));
    for (const r of page2.rows) {
      expect(ids1.has(`${r.source}-${r.id}`)).toBe(false);
    }
  });
});
