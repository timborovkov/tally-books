/**
 * Intake domain mutations.
 *
 * Every mutation goes through `assertCan(db, user, 'receipts',
 * 'write', { entityId })` for entity-scoped actions and falls back
 * to a user-scope check for personal routing. Audit trail is loose
 * verb-noun strings on `audit_log`: `intake.uploaded`,
 * `intake.ocr_applied`, `intake.routed`, `intake.confirmed`,
 * `intake.rejected`, `intake.wrong_route`, `intake.re_routed`.
 *
 * The wrong-route-recovery flow (§reRouteIntakeItem) is the heart
 * of this module. It stashes the previous routing snapshot, voids
 * the downstream Thing it had produced, and lets the caller supply
 * a new routing target. The audit pair `intake.wrong_route` +
 * `intake.re_routed` is the downstream-signal the v0.3 recalc
 * worker will listen on.
 */
import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  intakeItems,
  receipts,
  type IntakeItem,
  type NewIntakeItem,
} from "@/db/schema";
import type { ReceiptExtraction } from "@/lib/ai";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";
import { createReceipt, transitionReceipt } from "@/domains/receipts";

import { ConflictError, NotFoundError } from "../errors";

import {
  confirmIntakeInput,
  rejectIntakeInput,
  routeIntakeInput,
  type ConfirmIntakeInput,
  type RejectIntakeInput,
  type RouteIntakeInput,
} from "./schema";

// ── Create ───────────────────────────────────────────────────────────

export interface CreateIntakeItemInput {
  blobId: string;
  uploadedById: string | null;
}

export async function createIntakeItem(
  db: Db,
  actor: CurrentActor,
  input: CreateIntakeItemInput,
): Promise<IntakeItem> {
  return db.transaction(async (tx) => {
    const values: NewIntakeItem = {
      blobId: input.blobId,
      uploadedById: input.uploadedById,
      // status + ocrStatus default to 'new' / 'queued' on the table.
    };
    const [row] = await tx.insert(intakeItems).values(values).returning();
    if (!row) throw new Error("intake_items insert failed (no row returned)");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.uploaded",
      payload: { intakeItemId: row.id, blobId: input.blobId },
    });
    return row;
  });
}

// ── OCR lifecycle ────────────────────────────────────────────────────

export async function markIntakeOcrRunning(db: Db, intakeItemId: string): Promise<void> {
  await db
    .update(intakeItems)
    .set({ ocrStatus: "running", updatedAt: new Date() })
    .where(eq(intakeItems.id, intakeItemId));
}

export interface ApplyExtractionInput {
  intakeItemId: string;
  extraction: ReceiptExtraction;
  provider: string;
}

/**
 * Write OCR output + flip the item to `needs_review`. Called by the
 * intake-ocr worker after the vision provider succeeds. System
 * actor: no human triggered this directly.
 */
export async function applyExtraction(db: Db, input: ApplyExtractionInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(intakeItems)
      .where(eq(intakeItems.id, input.intakeItemId))
      .limit(1);
    if (!existing) throw new NotFoundError("intake_item", input.intakeItemId);

    await tx
      .update(intakeItems)
      .set({
        ocrStatus: "succeeded",
        ocrError: null,
        extraction: input.extraction,
        extractionProvider: input.provider,
        // Only move to needs_review from one of the pre-review states.
        // Items that were re-extracted after being confirmed stay
        // confirmed so the review UI doesn't lose track.
        status: existing.status === "new" ? "needs_review" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.intakeItemId));

    await recordAudit(tx, {
      actorId: null,
      actorKind: "system",
      action: "intake.ocr_applied",
      payload: {
        intakeItemId: input.intakeItemId,
        provider: input.provider,
        overallConfidence: input.extraction.overallConfidence,
      },
    });
  });
}

export interface MarkOcrFailedInput {
  intakeItemId: string;
  error: string;
}

export async function markIntakeOcrFailed(db: Db, input: MarkOcrFailedInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(intakeItems)
      .set({
        ocrStatus: "failed",
        ocrError: input.error,
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.intakeItemId));
    await recordAudit(tx, {
      actorId: null,
      actorKind: "system",
      action: "intake.ocr_failed",
      payload: { intakeItemId: input.intakeItemId, error: input.error },
    });
  });
}

// ── Routing ──────────────────────────────────────────────────────────

export async function routeIntakeItem(
  db: Db,
  actor: CurrentActor,
  raw: RouteIntakeInput,
): Promise<IntakeItem> {
  // Validate here — the mutation is the server of record. Callers
  // from typed paths (server actions) already shape correct inputs,
  // but bulk-mutate callers and future integrations can pass
  // anything. The refined schema catches "personal + entityId" and
  // "business + null entityId" violations.
  const input = routeIntakeInput.parse(raw);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(intakeItems)
      .where(eq(intakeItems.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("intake_item", input.id);

    if (existing.status === "rejected") {
      throw new ConflictError(`Cannot route a rejected intake item`, {
        intakeItemId: input.id,
        status: existing.status,
      });
    }
    if (existing.status === "confirmed") {
      throw new ConflictError(
        `Use reRouteIntakeItem to change the target on a confirmed intake item`,
        { intakeItemId: input.id, status: existing.status },
      );
    }

    // Permission gate — either the entity scope (business) or
    // personal scope (no entity).
    if (input.isPersonal === true) {
      await assertCan(tx, actor.user, "receipts", "write");
    } else if (input.entityId) {
      await assertCan(tx, actor.user, "receipts", "write", { entityId: input.entityId });
    }

    const [row] = await tx
      .update(intakeItems)
      .set({
        isPersonal: input.isPersonal === null ? null : String(input.isPersonal),
        entityId: input.entityId,
        targetFlow: input.targetFlow,
        status: "routed",
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.id))
      .returning();
    if (!row) throw new Error("intake_items update failed");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.routed",
      payload: {
        intakeItemId: input.id,
        isPersonal: input.isPersonal,
        entityId: input.entityId,
        targetFlow: input.targetFlow,
      },
    });

    return row;
  });
}

// ── Confirm ──────────────────────────────────────────────────────────

function extractionToReceiptFields(
  extraction: ReceiptExtraction | null,
): {
  occurredAt: Date | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  notes: string | null;
} {
  if (!extraction) {
    return { occurredAt: null, vendor: null, amount: null, currency: null, notes: null };
  }
  const occurredAt = extraction.occurredAt.value
    ? new Date(extraction.occurredAt.value)
    : null;
  return {
    occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
    vendor: extraction.vendor.value,
    amount: extraction.amount.value,
    currency: extraction.currency.value,
    notes: extraction.notes,
  };
}

/**
 * Finalise a routed intake item: create the downstream Thing, link
 * it on the intake row, flip status to `confirmed`. Currently only
 * `targetFlow='expense'` produces a concrete artifact (a receipt);
 * other target flows mark confirmed without a downstream link until
 * their domains land.
 */
export async function confirmIntakeItem(
  db: Db,
  actor: CurrentActor,
  raw: ConfirmIntakeInput,
): Promise<IntakeItem> {
  const input = confirmIntakeInput.parse(raw);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(intakeItems)
      .where(eq(intakeItems.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("intake_item", input.id);
    if (existing.status !== "routed" && existing.status !== "needs_review") {
      throw new ConflictError(
        `Cannot confirm an intake item in state '${existing.status}'. Route it first.`,
        { intakeItemId: input.id, status: existing.status },
      );
    }
    if (!existing.targetFlow) {
      throw new ConflictError("Intake item has no target flow set", {
        intakeItemId: input.id,
      });
    }

    let receiptId: string | null = existing.receiptId;

    if (existing.targetFlow === "expense") {
      const fallback = extractionToReceiptFields(
        (existing.extraction as ReceiptExtraction | null) ?? null,
      );
      const occurredAt = input.receipt?.occurredAt ?? fallback.occurredAt;
      const vendor = input.receipt?.vendor ?? fallback.vendor;
      const amountRaw = input.receipt?.amount ?? fallback.amount;
      const currency = (input.receipt?.currency ?? fallback.currency)?.toUpperCase() ?? null;
      const notes = input.receipt?.notes ?? fallback.notes ?? null;

      if (!occurredAt || !vendor || !amountRaw || !currency) {
        throw new ConflictError(
          "Missing required receipt fields on confirm. User must fill vendor / occurredAt / amount / currency.",
          { intakeItemId: input.id, missing: { occurredAt, vendor, amountRaw, currency } },
        );
      }

      // Entity resolution: business route uses entityId; personal
      // route would target the personal pseudo-entity. For v0.2 we
      // require an entity row in both cases — the personal pseudo-
      // entity is always a real row (seeded by setup wizard).
      const entityId = existing.entityId;
      if (!entityId) {
        throw new ConflictError(
          "Intake item has no entity set at confirm time. Route it to an entity (including personal) first.",
          { intakeItemId: input.id },
        );
      }

      const created = await createReceipt(tx, actor, {
        entityId,
        occurredAt,
        vendor,
        amount:
          typeof amountRaw === "number" ? amountRaw : String(amountRaw),
        currency,
        notes,
        blobId: existing.blobId,
      });
      receiptId = created.id;
    }
    // Other target flows: no downstream Thing yet. Confirmed without
    // a link; when the trip / mileage / benefit / compliance domains
    // land, their confirm branches extend here.

    const [row] = await tx
      .update(intakeItems)
      .set({
        receiptId,
        status: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.id))
      .returning();
    if (!row) throw new Error("intake_items update failed");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.confirmed",
      payload: {
        intakeItemId: input.id,
        targetFlow: existing.targetFlow,
        receiptId,
      },
    });

    return row;
  });
}

// ── Reject ───────────────────────────────────────────────────────────

export async function rejectIntakeItem(
  db: Db,
  actor: CurrentActor,
  raw: RejectIntakeInput,
): Promise<IntakeItem> {
  const input = rejectIntakeInput.parse(raw);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(intakeItems)
      .where(eq(intakeItems.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("intake_item", input.id);
    if (existing.status === "confirmed") {
      throw new ConflictError(
        "Cannot reject a confirmed intake item. Re-route or void the downstream artifact instead.",
        { intakeItemId: input.id, status: existing.status },
      );
    }

    const [row] = await tx
      .update(intakeItems)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(intakeItems.id, input.id))
      .returning();
    if (!row) throw new Error("intake_items update failed");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.rejected",
      payload: { intakeItemId: input.id, reason: input.reason ?? null },
    });

    return row;
  });
}

// ── Wrong-route recovery ─────────────────────────────────────────────

/**
 * Re-route an already-confirmed intake item. The current downstream
 * artifact (if any) is voided; the routing fields reset to
 * `needs_review`; `previousRouteSnapshot` is populated so the audit
 * trail + downstream-refresh signals have the before-picture.
 *
 * Why not just edit the downstream receipt in place: the re-route
 * may change the entity, and a receipt moving between entities is
 * a different accounting fact, not an edit. Void + recreate keeps
 * the version timeline on both entities honest.
 */
export async function reRouteIntakeItem(
  db: Db,
  actor: CurrentActor,
  raw: RouteIntakeInput,
): Promise<IntakeItem> {
  const input = routeIntakeInput.parse(raw);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(intakeItems)
      .where(eq(intakeItems.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("intake_item", input.id);
    if (existing.status !== "confirmed") {
      throw new ConflictError(
        "reRouteIntakeItem is for confirmed items only. Use routeIntakeItem for draft flows.",
        { intakeItemId: input.id, status: existing.status },
      );
    }

    // Snapshot previous routing before we touch anything.
    const previousRouteSnapshot = {
      isPersonal: existing.isPersonal,
      entityId: existing.entityId,
      targetFlow: existing.targetFlow,
      receiptId: existing.receiptId,
      routedAt: existing.updatedAt.toISOString(),
    };

    // Void the downstream receipt first. `transitionReceipt` will
    // gate on period locks — if the wrong-route destination is in a
    // locked period, the whole re-route fails, which is correct: we
    // cannot silently amend a filed period's contents.
    if (existing.receiptId) {
      // Transition to void goes through the amending flow when the
      // receipt is filed; the receipt domain already encodes that.
      // For draft/ready receipts this is a direct → void.
      const [currentReceipt] = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.id, existing.receiptId))
        .limit(1);
      if (currentReceipt) {
        if (currentReceipt.state === "filed") {
          await transitionReceipt(tx, actor, {
            id: existing.receiptId,
            nextState: "amending",
            reason: "intake wrong-route recovery",
          });
          await transitionReceipt(tx, actor, {
            id: existing.receiptId,
            nextState: "void",
            reason: "intake wrong-route recovery",
          });
        } else if (currentReceipt.state !== "void") {
          await transitionReceipt(tx, actor, {
            id: existing.receiptId,
            nextState: "void",
            reason: "intake wrong-route recovery",
          });
        }
      }
    }

    // Audit the wrong-route BEFORE writing the new routing so
    // history reads top-to-bottom: saw the problem, stashed snapshot,
    // wrote the correction.
    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.wrong_route",
      payload: { intakeItemId: input.id, previousRouteSnapshot },
    });

    // Reset routing + downstream link.
    await tx
      .update(intakeItems)
      .set({
        isPersonal: null,
        entityId: null,
        targetFlow: null,
        receiptId: null,
        status: "needs_review",
        previousRouteSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.id));

    // Apply the new routing + audit re_routed. Reuses the same
    // route-write path as the fresh-route mutation.
    const [row] = await tx
      .update(intakeItems)
      .set({
        isPersonal: input.isPersonal === null ? null : String(input.isPersonal),
        entityId: input.entityId,
        targetFlow: input.targetFlow,
        status: "routed",
        updatedAt: new Date(),
      })
      .where(eq(intakeItems.id, input.id))
      .returning();
    if (!row) throw new Error("intake_items update failed");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "intake.re_routed",
      payload: {
        intakeItemId: input.id,
        from: previousRouteSnapshot,
        to: {
          isPersonal: input.isPersonal,
          entityId: input.entityId,
          targetFlow: input.targetFlow,
        },
      },
    });

    return row;
  });
}

// ── Mass-action helpers ──────────────────────────────────────────────

/**
 * Run the same mutation across a batch of intake items. Each item
 * is processed in its own transaction (via the supplied mutation),
 * so partial batch success is acceptable — one bad row doesn't
 * poison the rest. The return value preserves order so the UI can
 * match results to the selected rows.
 */
export async function bulkMutate<T>(
  ids: string[],
  mutate: (id: string) => Promise<T>,
): Promise<Array<{ id: string; result: { ok: true; value: T } | { ok: false; error: string } }>> {
  const out: Array<{ id: string; result: { ok: true; value: T } | { ok: false; error: string } }> =
    [];
  for (const id of ids) {
    try {
      const value = await mutate(id);
      out.push({ id, result: { ok: true, value } });
    } catch (err) {
      out.push({
        id,
        result: { ok: false, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return out;
}
