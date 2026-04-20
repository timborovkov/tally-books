import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createEntity } from "@/domains/entities";
import {
  createReceipt,
  getReceiptAuditEntries,
  getReceiptHistory,
  transitionReceipt,
  updateReceipt,
} from "@/domains/receipts";
import { createPeriod, lockPeriod } from "@/domains/periods";
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

async function seedEntity(): Promise<string> {
  const j = await h.seedJurisdiction("EE");
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name: "Demo OÜ",
    entityType: "X",
    jurisdictionId: j,
    baseCurrency: "EUR",
    financialYearStartMonth: 1,
    vatRegistered: false,
    address: {},
    metadata: {},
  });
  return e.id;
}

describe("createReceipt", () => {
  it("creates the parent row, version 1, and points current_version_id at it", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    expect(r.state).toBe("draft");
    expect(r.currentVersionId).toBeTruthy();

    const versions = await getReceiptHistory(h.db, r.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version.versionNum).toBe(1);
    expect(versions[0]?.version.diff).toEqual([]);
    expect(versions[0]?.version.stateSnapshot).toMatchObject({
      vendor: "Lidl",
      amount: "9.9900",
      currency: "EUR",
    });
    expect(r.currentVersionId).toBe(versions[0]?.version.id);
  });

  it("writes an audit entry thing-scoped to the receipt", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    const audit = await getReceiptAuditEntries(h.db, r.id);
    expect(audit.map((a) => a.action)).toEqual(["receipt.created"]);
    expect(audit[0]?.thingType).toBe("receipt");
  });
});

describe("updateReceipt", () => {
  it("computes an RFC 6902 diff and bumps version_num", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    const updated = await updateReceipt(h.db, h.actor, {
      id: r.id,
      vendor: "Prisma",
      amount: "12.50",
      reason: "fixed vendor name",
    });

    expect(updated.vendor).toBe("Prisma");
    expect(updated.amount).toBe("12.5000");

    const history = await getReceiptHistory(h.db, r.id);
    expect(history).toHaveLength(2);
    const v2 = history[1]?.version;
    expect(v2?.versionNum).toBe(2);
    const diff = v2?.diff as Array<Record<string, unknown>>;
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.some((op) => op.path === "/vendor" && op.value === "Prisma")).toBe(true);
    expect(diff.some((op) => op.path === "/amount" && op.value === "12.5000")).toBe(true);
    expect(v2?.semanticSummary).toBe("fixed vendor name");

    // Parent pointer advanced to the new version.
    expect(updated.currentVersionId).toBe(v2?.id);
  });

  it("is a no-op when nothing changed — no new version, no audit row", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    await updateReceipt(h.db, h.actor, { id: r.id, vendor: "Lidl" });
    const history = await getReceiptHistory(h.db, r.id);
    expect(history).toHaveLength(1);
    const audit = await getReceiptAuditEntries(h.db, r.id);
    expect(audit).toHaveLength(1);
  });

  it("rejects stale writes via expectedVersionNum → VersionConflictError with accurate meta", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    await updateReceipt(h.db, h.actor, { id: r.id, vendor: "Prisma" }); // v2
    await updateReceipt(h.db, h.actor, { id: r.id, vendor: "Maxima" }); // v3

    try {
      // Client thinks they have v2; reality is v3.
      await updateReceipt(h.db, h.actor, {
        id: r.id,
        vendor: "Rimi",
        expectedVersionNum: 2,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VersionConflictError);
      const e = err as VersionConflictError;
      expect(e.meta).toMatchObject({
        thingType: "receipt",
        id: r.id,
        expected: 2,
        actual: 3,
      });
    }
  });

  it("rolls back the version insert when the parent update throws", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    // Force a constraint violation by passing a bogus expected version
    await expect(
      updateReceipt(h.db, h.actor, {
        id: r.id,
        vendor: "Prisma",
        expectedVersionNum: 99,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const history = await getReceiptHistory(h.db, r.id);
    expect(history).toHaveLength(1); // only v1
  });
});

describe("transitionReceipt", () => {
  it("walks draft → ready → filed and appends version rows + audit", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    const ready = await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "ready" });
    expect(ready.state).toBe("ready");
    const filed = await transitionReceipt(h.db, h.actor, {
      id: r.id,
      nextState: "filed",
      filedRef: "EMTA-2026-001",
    });
    expect(filed.state).toBe("filed");
    expect(filed.filedAt).toBeInstanceOf(Date);
    expect(filed.filedRef).toBe("EMTA-2026-001");

    const history = await getReceiptHistory(h.db, r.id);
    expect(history.map((h) => h.version.versionNum)).toEqual([1, 2, 3]);

    const audit = await getReceiptAuditEntries(h.db, r.id);
    expect(audit.map((a) => a.action).sort()).toEqual(
      ["receipt.created", "receipt.ready", "receipt.filed"].sort(),
    );
  });

  it("rejects illegal transitions (draft → filed)", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    await expect(
      transitionReceipt(h.db, h.actor, { id: r.id, nextState: "filed" }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it("supports amending cycle: filed → amending → filed", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "ready" });
    await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "filed" });
    await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "amending" });
    const filedAgain = await transitionReceipt(h.db, h.actor, {
      id: r.id,
      nextState: "filed",
    });

    expect(filedAgain.state).toBe("filed");
    const history = await getReceiptHistory(h.db, r.id);
    const filedVersions = history.filter((h) => h.version.semanticSummary?.includes("→ filed"));
    expect(filedVersions.length).toBeGreaterThanOrEqual(2); // the "amended" UI label criterion
  });
});

describe("period lock enforcement", () => {
  it("rejects createReceipt inside a locked period", async () => {
    const entityId = await seedEntity();
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      createReceipt(h.db, h.actor, {
        entityId,
        occurredAt: new Date("2025-06-15T00:00:00Z"),
        vendor: "Lidl",
        amount: "9.99",
        currency: "EUR",
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects updateReceipt that would move occurred_at OUT of a locked period", async () => {
    // Receipt sits inside the locked period. Moving its date to an
    // unlocked date still mutates what the locked period "contains",
    // so the source side must be checked too.
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2025-06-15T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      updateReceipt(h.db, h.actor, {
        id: r.id,
        occurredAt: new Date("2026-06-15T00:00:00Z"), // unlocked year
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects updateReceipt that would move occurred_at into a locked period", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      updateReceipt(h.db, h.actor, {
        id: r.id,
        occurredAt: new Date("2025-06-15T00:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("rejects transitionReceipt to 'filed' inside a locked period", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2025-06-15T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "ready" });

    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    await expect(
      transitionReceipt(h.db, h.actor, { id: r.id, nextState: "filed" }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
  });

  it("allows draft → ready even inside a locked period (gate only kicks in at filed/amending)", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2025-06-15T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    const ready = await transitionReceipt(h.db, h.actor, { id: r.id, nextState: "ready" });
    expect(ready.state).toBe("ready");
  });

  it("allows updates on receipts outside any locked period", async () => {
    const entityId = await seedEntity();
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed" });

    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });
    const updated = await updateReceipt(h.db, h.actor, { id: r.id, vendor: "Prisma" });
    expect(updated.vendor).toBe("Prisma");
  });
});

describe("concurrent updates", () => {
  it("serialises two parallel updates — both succeed with distinct version_nums", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    const [a, b] = await Promise.all([
      updateReceipt(h.db, h.actor, { id: r.id, vendor: "Prisma" }),
      updateReceipt(h.db, h.actor, { id: r.id, notes: "reimbursable" }),
    ]);

    const history = await getReceiptHistory(h.db, r.id);
    const versionNums = history.map((h) => h.version.versionNum);
    expect(versionNums).toEqual([1, 2, 3]);
    // Both updates landed; one vendor + one notes change.
    expect([a.vendor, b.vendor]).toContain("Prisma");
    expect([a.notes, b.notes]).toContain("reimbursable");
  });

  it("rejects conflicting writes when both supply the same expectedVersionNum", async () => {
    const entityId = await seedEntity();
    const r = await createReceipt(h.db, h.actor, {
      entityId,
      occurredAt: new Date("2026-04-20T00:00:00Z"),
      vendor: "Lidl",
      amount: "9.99",
      currency: "EUR",
    });

    const results = await Promise.allSettled([
      updateReceipt(h.db, h.actor, { id: r.id, vendor: "Prisma", expectedVersionNum: 1 }),
      updateReceipt(h.db, h.actor, { id: r.id, notes: "reimbursable", expectedVersionNum: 1 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(VersionConflictError);
  });
});

describe("period service audit", () => {
  it("audits period.locked and period.unlocked", async () => {
    const entityId = await seedEntity();
    const period = await createPeriod(h.db, h.actor, {
      entityId,
      kind: "year",
      label: "FY2025",
      startAt: new Date("2025-01-01T00:00:00Z"),
      endAt: new Date("2025-12-31T23:59:59Z"),
    });
    await lockPeriod(h.db, h.actor, { periodId: period.id, reason: "filed with EMTA" });

    const { unlockPeriod } = await import("@/domains/periods");
    await unlockPeriod(h.db, h.actor, { periodId: period.id, reason: "correction needed" });

    const rows = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "period.locked"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ periodId: period.id, reason: "filed with EMTA" });

    const unlocks = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "period.unlocked"));
    expect(unlocks).toHaveLength(1);
  });
});
