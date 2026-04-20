/**
 * Integration tests for the intake pipeline. Exercises the whole
 * vertical against a real Postgres + the shipped domain mutations.
 *
 * What is and isn't covered:
 *   - Covered end-to-end: blob row insert (sha256 dedupe happens at
 *     the upload-service layer tested in unit tests), intake_item
 *     lifecycle, OCR `applyExtraction`, routeIntakeItem, confirm,
 *     reject, reRouteIntakeItem (wrong-route recovery), bulk mutations.
 *   - Not covered here: MinIO object bytes and the OpenAI vision
 *     provider. Both are external services; we stub the vision
 *     provider and insert `blobs` rows directly instead of
 *     round-tripping through MinIO. The upload route + MinIO + vision
 *     end-to-end is covered by the dev-env verification steps in
 *     the plan file — they require live credentials.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createEntity } from "@/domains/entities";
import {
  applyExtraction,
  bulkMutate,
  confirmIntakeItem,
  createIntakeItem,
  getIntakeAuditEntries,
  listIntakeItems,
  rejectIntakeItem,
  reRouteIntakeItem,
  routeIntakeItem,
} from "@/domains/intake";

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

let jurisdictionCounter = 0;
async function seedEntity(name = "Demo OÜ"): Promise<string> {
  jurisdictionCounter += 1;
  const j = await h.seedJurisdiction(`J${jurisdictionCounter}`);
  const e = await createEntity(h.db, h.actor, {
    kind: "legal",
    name,
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

async function seedBlob(): Promise<string> {
  const [row] = await h.db
    .insert(schema.blobs)
    .values({
      bucket: "receipts",
      objectKey: `2026/04/${Math.random().toString(36).slice(2)}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 1024,
      sha256: `sha_${Math.random().toString(36).slice(2, 18)}`,
      uploadedById: h.actor.userId,
    })
    .returning();
  if (!row) throw new Error("blob insert failed");
  return row.id;
}

function sampleExtraction(overrides: Partial<{
  vendor: string;
  amount: string;
  currency: string;
  occurredAt: string;
  overallConfidence: number;
}> = {}) {
  return {
    vendor: { value: overrides.vendor ?? "Prisma", confidence: 0.9 },
    occurredAt: {
      value: overrides.occurredAt ?? "2026-04-20T12:00:00Z",
      confidence: 0.95,
    },
    amount: { value: overrides.amount ?? "12.5000", confidence: 0.92 },
    currency: { value: overrides.currency ?? "EUR", confidence: 0.98 },
    taxLines: null,
    categoryHint: "groceries",
    notes: null,
    overallConfidence: overrides.overallConfidence ?? 0.9,
  };
}

describe("intake lifecycle", () => {
  it("uploads → OCR → route → confirm produces a receipt and audit trail", async () => {
    const entityId = await seedEntity();
    const blobId = await seedBlob();

    const item = await createIntakeItem(h.db, h.actor, {
      blobId,
      uploadedById: h.actor.userId,
    });
    expect(item.status).toBe("new");
    expect(item.ocrStatus).toBe("queued");

    await applyExtraction(h.db, {
      intakeItemId: item.id,
      extraction: sampleExtraction(),
      provider: "test:stub",
    });
    const [afterOcr] = await h.db
      .select()
      .from(schema.intakeItems)
      .where(eq(schema.intakeItems.id, item.id));
    expect(afterOcr?.status).toBe("needs_review");
    expect(afterOcr?.ocrStatus).toBe("succeeded");
    expect(afterOcr?.extractionProvider).toBe("test:stub");

    await routeIntakeItem(h.db, h.actor, {
      id: item.id,
      isPersonal: false,
      entityId,
      targetFlow: "expense",
    });

    const confirmed = await confirmIntakeItem(h.db, h.actor, { id: item.id });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.receiptId).toBeTruthy();

    // Receipt was actually created and linked to the blob.
    const [receipt] = await h.db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, confirmed.receiptId!));
    expect(receipt?.blobId).toBe(blobId);
    expect(receipt?.vendor).toBe("Prisma");

    // Audit trail has the expected actions in order.
    const audit = await getIntakeAuditEntries(h.db, item.id);
    const actions = audit.map((a) => a.action).reverse(); // audit sorted desc; reverse → chronological
    expect(actions).toEqual([
      "intake.uploaded",
      "intake.ocr_applied",
      "intake.routed",
      "intake.confirmed",
    ]);
  });

  it("rejects business routing without entityId", async () => {
    const blobId = await seedBlob();
    const item = await createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId });

    await expect(
      routeIntakeItem(h.db, h.actor, {
        id: item.id,
        isPersonal: false,
        entityId: null,
        targetFlow: "expense",
      }),
    ).rejects.toThrow();
  });

  it("rejects personal routing with an entityId", async () => {
    const entityId = await seedEntity();
    const blobId = await seedBlob();
    const item = await createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId });

    await expect(
      routeIntakeItem(h.db, h.actor, {
        id: item.id,
        isPersonal: true,
        entityId,
        targetFlow: "expense",
      }),
    ).rejects.toThrow();
  });

  it("rejecting an intake item before confirm leaves no receipt", async () => {
    const blobId = await seedBlob();
    const item = await createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId });
    await rejectIntakeItem(h.db, h.actor, { id: item.id, reason: "user discarded" });

    const [after] = await h.db
      .select()
      .from(schema.intakeItems)
      .where(eq(schema.intakeItems.id, item.id));
    expect(after?.status).toBe("rejected");
    expect(after?.receiptId).toBeNull();
  });

  it("cannot reject a confirmed intake item", async () => {
    const entityId = await seedEntity();
    const blobId = await seedBlob();
    const item = await createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId });
    await applyExtraction(h.db, {
      intakeItemId: item.id,
      extraction: sampleExtraction(),
      provider: "test:stub",
    });
    await routeIntakeItem(h.db, h.actor, {
      id: item.id,
      isPersonal: false,
      entityId,
      targetFlow: "expense",
    });
    await confirmIntakeItem(h.db, h.actor, { id: item.id });

    await expect(
      rejectIntakeItem(h.db, h.actor, { id: item.id }),
    ).rejects.toThrow(/confirmed/i);
  });
});

describe("wrong-route recovery", () => {
  it("re-routes a confirmed item: voids the receipt, swaps routing, audits both events", async () => {
    const entityA = await seedEntity("Company A");
    const entityB = await seedEntity("Company B");
    const blobId = await seedBlob();

    const item = await createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId });
    await applyExtraction(h.db, {
      intakeItemId: item.id,
      extraction: sampleExtraction(),
      provider: "test:stub",
    });
    await routeIntakeItem(h.db, h.actor, {
      id: item.id,
      isPersonal: false,
      entityId: entityA,
      targetFlow: "expense",
    });
    const confirmed = await confirmIntakeItem(h.db, h.actor, { id: item.id });
    const originalReceiptId = confirmed.receiptId!;

    // Caught the wrong route — actually belongs on Company B.
    const reRouted = await reRouteIntakeItem(h.db, h.actor, {
      id: item.id,
      isPersonal: false,
      entityId: entityB,
      targetFlow: "expense",
    });
    expect(reRouted.status).toBe("routed");
    expect(reRouted.entityId).toBe(entityB);
    expect(reRouted.previousRouteSnapshot).toBeTruthy();
    const snap = reRouted.previousRouteSnapshot as {
      entityId: string;
      receiptId: string;
    };
    expect(snap.entityId).toBe(entityA);
    expect(snap.receiptId).toBe(originalReceiptId);

    // Old receipt is voided, downstream link cleared.
    const [voided] = await h.db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, originalReceiptId));
    expect(voided?.state).toBe("void");
    expect(reRouted.receiptId).toBeNull();

    // Audit trail records both events.
    const audit = await getIntakeAuditEntries(h.db, item.id);
    const actions = audit.map((a) => a.action);
    expect(actions).toContain("intake.wrong_route");
    expect(actions).toContain("intake.re_routed");
  });
});

describe("bulk actions", () => {
  it("bulk mark personal routes N items and each gets its own audit row", async () => {
    const blobIds = await Promise.all([seedBlob(), seedBlob(), seedBlob()]);
    const items = await Promise.all(
      blobIds.map((blobId) =>
        createIntakeItem(h.db, h.actor, { blobId, uploadedById: h.actor.userId }),
      ),
    );

    const results = await bulkMutate(
      items.map((i) => i.id),
      (id) =>
        routeIntakeItem(h.db, h.actor, {
          id,
          isPersonal: true,
          entityId: null,
          targetFlow: "expense",
        }),
    );
    expect(results.every((r) => r.result.ok)).toBe(true);

    const after = await listIntakeItems(h.db);
    for (const row of after) {
      expect(row.status).toBe("routed");
      expect(row.isPersonal).toBe("true");
    }

    // One audit row per item (plus three intake.uploaded from earlier).
    const routedAudit = await h.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "intake.routed"),
        ),
      );
    expect(routedAudit.length).toBe(3);
  });

  it("bulkMutate preserves per-item success/failure without failing the batch", async () => {
    const entityId = await seedEntity();
    const blob1 = await seedBlob();
    const blob2 = await seedBlob();
    const item1 = await createIntakeItem(h.db, h.actor, {
      blobId: blob1,
      uploadedById: h.actor.userId,
    });
    const item2 = await createIntakeItem(h.db, h.actor, {
      blobId: blob2,
      uploadedById: h.actor.userId,
    });

    // First succeeds, second fails (personal with entityId — rejected
    // by the schema refinement).
    const results = await bulkMutate([item1.id, item2.id], async (id) => {
      await routeIntakeItem(h.db, h.actor, {
        id,
        isPersonal: id === item1.id ? false : true,
        entityId: entityId,
        targetFlow: "expense",
      });
    });
    expect(results[0]!.result.ok).toBe(true);
    expect(results[1]!.result.ok).toBe(false);
  });
});
