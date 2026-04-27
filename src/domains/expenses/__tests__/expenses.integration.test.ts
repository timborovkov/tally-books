import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { expenses } from "@/db/schema";
import { createCategory } from "@/domains/categories";
import { createEntity } from "@/domains/entities";
import {
  createExpense,
  getExpenseAuditEntries,
  getExpenseHistory,
  linkReceipt,
  listExpenses,
  markReimbursed,
  transitionExpense,
  updateExpense,
} from "@/domains/expenses";
import { createPeriod, lockPeriod } from "@/domains/periods";
import { createReceipt } from "@/domains/receipts";
import { ConflictError, ValidationError } from "@/domains/errors";
import {
  InvalidStateTransitionError,
  PeriodLockedError,
  VersionConflictError,
} from "@/lib/versioning";

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

// One jurisdiction per test, shared across multiple entities so the
// `jurisdictions_code_unique` constraint doesn't trip when a single
// test seeds entityA + entityB.
let cachedJurisdictionId: string | null = null;

beforeEach(() => {
  cachedJurisdictionId = null;
});

async function seedEntity(name = "Demo OÜ"): Promise<string> {
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

async function seedExpenseCategory(entityId: string): Promise<string> {
  const c = await createCategory(h.db, h.actor, {
    scope: "entity",
    entityId,
    name: "Office supplies",
    kind: "expense",
  });
  return c.id;
}

describe("createExpense", () => {
  it("creates the parent row, version 1, and points current_version_id at it", async () => {
    const entityId = await seedEntity();
    const categoryId = await seedExpenseCategory(entityId);

    const e = await createExpense(h.db, h.actor, {
      entityId,
      categoryId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
      paidBy: "entity",
    });

    expect(e.state).toBe("draft");
    expect(e.amount).toBe("9.9900");
    expect(e.reimbursementStatus).toBe("not_applicable");
    expect(e.currentVersionId).toBeTruthy();

    const history = await getExpenseHistory(h.db, e.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.version.versionNum).toBe(1);
    expect(history[0]?.version.diff).toEqual([]);
    expect(history[0]?.version.stateSnapshot).toMatchObject({
      vendor: "Lidl",
      amount: "9.9900",
      currency: "EUR",
      paidBy: "entity",
    });
  });

  it("personal_reimbursable defaults reimbursementStatus to 'pending'", async () => {
    const entityId = await seedEntity();

    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Coffee shop",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "4.50",
      currency: "EUR",
      paidBy: "personal_reimbursable",
    });

    expect(e.paidBy).toBe("personal_reimbursable");
    expect(e.reimbursementStatus).toBe("pending");
  });

  it("rejects a category from a different entity", async () => {
    const entityA = await seedEntity("Co A");
    const entityB = await seedEntity("Co B");
    const categoryB = await seedExpenseCategory(entityB);

    await expect(
      createExpense(h.db, h.actor, {
        entityId: entityA,
        categoryId: categoryB,
        occurredAt: new Date("2026-04-20T00:00:00Z"),
        amount: "10",
        currency: "EUR",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-expense category kind", async () => {
    const entityId = await seedEntity();
    const incomeCat = await createCategory(h.db, h.actor, {
      scope: "entity",
      entityId,
      name: "Consulting income",
      kind: "income",
    });

    await expect(
      createExpense(h.db, h.actor, {
        entityId,
        categoryId: incomeCat.id,
        occurredAt: new Date("2026-04-20T00:00:00Z"),
        amount: "10",
        currency: "EUR",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateExpense", () => {
  it("computes a diff and bumps version_num", async () => {
    const entityId = await seedEntity();

    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    const updated = await updateExpense(h.db, h.actor, {
      id: e.id,
      vendor: "Prisma",
      amount: "12.50",
      reason: "fixed vendor name",
    });

    expect(updated.vendor).toBe("Prisma");
    expect(updated.amount).toBe("12.5000");

    const history = await getExpenseHistory(h.db, e.id);
    expect(history).toHaveLength(2);
    const v2 = history[1]?.version;
    expect(v2?.versionNum).toBe(2);
    expect(
      (v2?.diff as Array<{ path: string; value: unknown }>).some(
        (op) => op.path === "/vendor" && op.value === "Prisma",
      ),
    ).toBe(true);
    expect(v2?.semanticSummary).toBe("fixed vendor name");
  });

  it("changing paidBy from entity → personal_reimbursable resets reimbursementStatus to pending", async () => {
    const entityId = await seedEntity();

    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
      paidBy: "entity",
    });
    expect(e.reimbursementStatus).toBe("not_applicable");

    const updated = await updateExpense(h.db, h.actor, {
      id: e.id,
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
      paidBy: "personal_reimbursable",
    });
    expect(updated.paidBy).toBe("personal_reimbursable");
    expect(updated.reimbursementStatus).toBe("pending");
  });

  it("rejects stale writes via expectedVersionNum", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    await updateExpense(h.db, h.actor, { id: e.id, vendor: "Prisma" });
    await updateExpense(h.db, h.actor, { id: e.id, vendor: "Maxima" });

    await expect(
      updateExpense(h.db, h.actor, {
        id: e.id,
        vendor: "Rimi",
        expectedVersionNum: 2,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("rejects edits to a filed expense", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    await transitionExpense(h.db, h.actor, { id: e.id, nextState: "ready" });
    await transitionExpense(h.db, h.actor, { id: e.id, nextState: "filed" });

    await expect(
      updateExpense(h.db, h.actor, { id: e.id, vendor: "Prisma" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("transitionExpense", () => {
  it("walks draft → ready → filed and appends version + audit rows", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    await transitionExpense(h.db, h.actor, { id: e.id, nextState: "ready" });
    const filed = await transitionExpense(h.db, h.actor, {
      id: e.id,
      nextState: "filed",
      filedRef: "EMTA-2026-002",
    });
    expect(filed.state).toBe("filed");
    expect(filed.filedAt).toBeInstanceOf(Date);
    expect(filed.filedRef).toBe("EMTA-2026-002");

    const audit = await getExpenseAuditEntries(h.db, e.id);
    expect(audit.map((a) => a.action).sort()).toEqual(
      ["expense.created", "expense.ready", "expense.filed"].sort(),
    );
  });

  it("rejects illegal transitions", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    await expect(
      transitionExpense(h.db, h.actor, { id: e.id, nextState: "filed" }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    await expect(
      transitionExpense(h.db, h.actor, { id: e.id, nextState: "sent" }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe("markReimbursed", () => {
  it("flips reimbursementStatus pending → paid_back and writes a version + audit row", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Coffee shop",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "4.50",
      currency: "EUR",
      paidBy: "personal_reimbursable",
    });
    expect(e.reimbursementStatus).toBe("pending");

    const reimbursed = await markReimbursed(h.db, h.actor, { id: e.id, reason: "Wire-transfer" });
    expect(reimbursed.reimbursementStatus).toBe("paid_back");

    const history = await getExpenseHistory(h.db, e.id);
    expect(history).toHaveLength(2);
    expect(history[1]?.version.semanticSummary).toBe("Wire-transfer");

    const audit = await getExpenseAuditEntries(h.db, e.id);
    expect(audit.map((a) => a.action)).toContain("expense.reimbursed");
  });

  it("rejects on entity-paid expenses", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Coffee shop",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "4.50",
      currency: "EUR",
      paidBy: "entity",
    });

    await expect(markReimbursed(h.db, h.actor, { id: e.id })).rejects.toBeInstanceOf(ConflictError);
  });

  it("is not idempotent — second call on paid_back row throws ConflictError", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Coffee shop",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "4.50",
      currency: "EUR",
      paidBy: "personal_reimbursable",
    });
    await markReimbursed(h.db, h.actor, { id: e.id });
    await expect(markReimbursed(h.db, h.actor, { id: e.id })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("linkReceipt", () => {
  it("links and unlinks a receipt, writing version rows for each transition", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    const linked = await linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: r.id });
    expect(linked.linkedReceiptId).toBe(r.id);

    const unlinked = await linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: null });
    expect(unlinked.linkedReceiptId).toBeNull();

    const history = await getExpenseHistory(h.db, e.id);
    expect(history.map((v) => v.version.semanticSummary)).toEqual([
      null,
      "Linked receipt",
      "Unlinked receipt",
    ]);

    const audit = await getExpenseAuditEntries(h.db, e.id);
    const verbs = audit.map((a) => a.action);
    expect(verbs).toContain("expense.receipt_linked");
    expect(verbs).toContain("expense.receipt_unlinked");
  });

  it("rejects a receipt from a different entity", async () => {
    const entityA = await seedEntity("A");
    const entityB = await seedEntity("B");
    const e = await createExpense(h.db, h.actor, {
      entityId: entityA,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    const rB = await createReceipt(h.db, h.actor, {
      entityId: entityB,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    await expect(
      linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: rB.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("idempotent when linking the same receipt twice — no extra version row", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });

    await linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: r.id });
    await linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: r.id });

    const history = await getExpenseHistory(h.db, e.id);
    expect(history).toHaveLength(2); // v1 (create) + v2 (first link). Second link is a no-op.
  });
});

describe("listExpenses", () => {
  async function seedSet(): Promise<{ entityA: string; entityB: string }> {
    const entityA = await seedEntity("A");
    const entityB = await seedEntity("B");
    const dates = ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"];
    for (const d of dates) {
      await createExpense(h.db, h.actor, {
        entityId: entityA,
        vendor: `Vendor A ${d}`,
        occurredAt: new Date(`${d}T00:00:00Z`),
        amount: "10",
        currency: "EUR",
        paidBy: "entity",
      });
      await createExpense(h.db, h.actor, {
        entityId: entityB,
        vendor: `Vendor B ${d}`,
        occurredAt: new Date(`${d}T00:00:00Z`),
        amount: "20",
        currency: "EUR",
        paidBy: "personal_reimbursable",
      });
    }
    return { entityA, entityB };
  }

  it("paginates and returns total count", async () => {
    await seedSet(); // 8 rows
    const page1 = await listExpenses(h.db, { page: 1, pageSize: 3 });
    expect(page1.rows).toHaveLength(3);
    expect(page1.totalCount).toBe(8);
    expect(page1.page).toBe(1);

    const page3 = await listExpenses(h.db, { page: 3, pageSize: 3 });
    expect(page3.rows).toHaveLength(2); // 8 = 3+3+2
  });

  it("filters by entity", async () => {
    const { entityA } = await seedSet();
    const result = await listExpenses(h.db, { entityIds: [entityA] });
    expect(result.totalCount).toBe(4);
    expect(result.rows.every((r) => r.entityId === entityA)).toBe(true);
  });

  it("filters by paidBy + reimbursementStatus", async () => {
    await seedSet();
    const owed = await listExpenses(h.db, {
      paidBy: ["personal_reimbursable"],
      reimbursementStatus: ["pending"],
    });
    expect(owed.totalCount).toBe(4);
  });

  it("filters by date range", async () => {
    await seedSet();
    const q = await listExpenses(h.db, {
      dateFrom: new Date("2026-02-01T00:00:00Z"),
      dateTo: new Date("2026-03-31T00:00:00Z"),
    });
    expect(q.totalCount).toBe(4);
  });

  it("search hits vendor (ILIKE)", async () => {
    await seedSet();
    const q = await listExpenses(h.db, { search: "vendor a" });
    expect(q.totalCount).toBe(4);
  });

  it("excludes void rows by default", async () => {
    const { entityA } = await seedSet();
    const [first] = await listExpenses(h.db, { entityIds: [entityA] }).then((r) => r.rows);
    if (!first) throw new Error("seed missing");
    await transitionExpense(h.db, h.actor, { id: first.id, nextState: "void" });

    const q = await listExpenses(h.db, { entityIds: [entityA] });
    expect(q.totalCount).toBe(3);

    const qWithVoid = await listExpenses(h.db, {
      entityIds: [entityA],
      includeVoid: true,
    });
    expect(qWithVoid.totalCount).toBe(4);
  });

  it("returns empty list when entityIds is the empty array", async () => {
    await seedSet();
    const q = await listExpenses(h.db, { entityIds: [] });
    expect(q.totalCount).toBe(0);
    expect(q.rows).toEqual([]);
  });
});

describe("integration: receipt and expense persist independently", () => {
  it("voiding the linked receipt does not cascade — expense keeps the link with set null on delete only", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    await linkReceipt(h.db, h.actor, { expenseId: e.id, receiptId: r.id });

    // Voiding the receipt is a state transition, not a delete. The
    // linked_receipt_id stays put — auditors expect the relationship
    // to remain visible even after the source is voided.
    await transitionExpense(h.db, h.actor, { id: e.id, nextState: "void" });

    const [row] = await h.db.select().from(expenses).where(eq(expenses.id, e.id)).limit(1);
    expect(row?.linkedReceiptId).toBe(r.id);
  });
});

describe("period lock enforcement", () => {
  it("rejects createExpense inside a locked period", async () => {
    const entityId = await seedEntity();
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2026-01-01T00:00:00Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      createExpense(h.db, h.actor, {
        entityId,
        vendor: "Lidl",
        occurredAt: new Date("2025-06-15T00:00:00Z"),
        amount: "9.99",
        currency: "EUR",
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects updateExpense moving occurredAt INTO a locked period", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2026-01-01T00:00:00Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      updateExpense(h.db, h.actor, {
        id: e.id,
        occurredAt: new Date("2025-06-15T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects transitionExpense to 'filed' inside a locked period", async () => {
    const entityId = await seedEntity();
    const e = await createExpense(h.db, h.actor, {
      entityId,
      vendor: "Lidl",
      occurredAt: new Date("2025-06-15T00:00:00Z"),
      amount: "9.99",
      currency: "EUR",
    });
    await transitionExpense(h.db, h.actor, { id: e.id, nextState: "ready" });

    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2026-01-01T00:00:00Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      transitionExpense(h.db, h.actor, { id: e.id, nextState: "filed" }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });
});
