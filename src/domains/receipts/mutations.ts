import { desc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { receipts, receiptVersions, type Receipt } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";
import {
  assertPeriodUnlocked,
  assertReturning,
  assertTransition,
  createPatch,
  pickSnapshot,
  VersionConflictError,
} from "@/lib/versioning";

import { NotFoundError } from "../errors";

import {
  createReceiptInput,
  transitionReceiptInput,
  updateReceiptInput,
  type CreateReceiptInput,
  type TransitionReceiptInput,
  type UpdateReceiptInput,
} from "./schema";

/**
 * Fields that define the logical Thing. Listed explicitly (not derived
 * from the table) so the versioning boundary stays under code review:
 * adding a domain column is a deliberate act, not a transitive effect of
 * a schema change. Bookkeeping columns (state, current_version_id,
 * timestamps, flags) are NOT here — state lives on its own path in the
 * diff (see transitionReceipt).
 */
const RECEIPT_DOMAIN_FIELDS = [
  "entityId",
  "occurredAt",
  "vendor",
  "amount",
  "currency",
  "notes",
] as const satisfies ReadonlyArray<keyof Receipt>;

export async function createReceipt(
  db: Db,
  actor: CurrentActor,
  raw: CreateReceiptInput,
): Promise<Receipt> {
  const input = createReceiptInput.parse(raw);
  await assertCan(db, actor.user, "receipts", "write", { entityId: input.entityId });

  return db.transaction(async (tx) => {
    // Inside the tx so a concurrent lockPeriod commit can't land between
    // the check and the insert. `update`/`transition` mutations already
    // do this — create was the outlier.
    await assertPeriodUnlocked(tx, {
      entityId: input.entityId,
      occurredAt: input.occurredAt,
    });

    const parent = assertReturning(
      (
        await tx
          .insert(receipts)
          .values({
            entityId: input.entityId,
            occurredAt: input.occurredAt,
            vendor: input.vendor,
            amount: input.amount,
            currency: input.currency,
            notes: input.notes ?? null,
          })
          .returning()
      )[0],
      "receipt insert",
    );

    const snapshot = pickSnapshot(parent, RECEIPT_DOMAIN_FIELDS);

    const version = assertReturning(
      (
        await tx
          .insert(receiptVersions)
          .values({
            receiptId: parent.id,
            versionNum: 1,
            stateSnapshot: snapshot,
            diff: [],
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: receiptVersions.id })
      )[0],
      "receipt_versions insert (v1)",
    );

    const withPointer = assertReturning(
      (
        await tx
          .update(receipts)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(receipts.id, parent.id))
          .returning()
      )[0],
      "receipt pointer update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "receipt.created",
      thingType: "receipt",
      thingId: withPointer.id,
      payload: { versionNum: 1 },
    });

    return withPointer;
  });
}

export async function updateReceipt(
  db: Db,
  actor: CurrentActor,
  raw: UpdateReceiptInput,
): Promise<Receipt> {
  const input = updateReceiptInput.parse(raw);

  return db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE holds the row lock until commit so two
    // concurrent updates can't both read version N and race to write
    // version N+1. The unique(receipt_id, version_num) constraint is
    // the backstop, but FOR UPDATE turns a retryable 23505 into a
    // clean serial write.
    const [existing] = await tx
      .select()
      .from(receipts)
      .where(eq(receipts.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("receipt", input.id);
    await assertCan(tx, actor.user, "receipts", "write", { entityId: existing.entityId });

    const [latest] = await tx
      .select({ versionNum: receiptVersions.versionNum })
      .from(receiptVersions)
      .where(eq(receiptVersions.receiptId, input.id))
      .orderBy(desc(receiptVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    if (input.expectedVersionNum !== undefined && input.expectedVersionNum !== prevVersionNum) {
      throw new VersionConflictError("receipt", input.id, input.expectedVersionNum, prevVersionNum);
    }

    // Build the patched parent row. Only the fields the caller touched
    // move; everything else is copied from `existing` so the snapshot
    // keeps a full picture of the logical Thing.
    const nextRow: Receipt = {
      ...existing,
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    // Period-lock check runs against BOTH sides when occurred_at moves.
    // A write inside a locked period is obviously blocked; moving a
    // receipt OUT of a locked period is also a change to that period's
    // contents (it no longer contains this receipt) so it's equally a
    // violation of the lock's "this period is frozen" contract. When
    // source == target, one of these is a no-op.
    await assertPeriodUnlocked(tx, {
      entityId: existing.entityId,
      occurredAt: existing.occurredAt,
    });
    if (nextRow.occurredAt.getTime() !== existing.occurredAt.getTime()) {
      await assertPeriodUnlocked(tx, {
        entityId: nextRow.entityId,
        occurredAt: nextRow.occurredAt,
      });
    }

    const prevSnapshot = pickSnapshot(existing, RECEIPT_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, RECEIPT_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    if (patch.length === 0) {
      // No-op update: no new version, no audit row. Keeps the timeline
      // honest — only meaningful changes land in history.
      return existing;
    }

    const newVersion = assertReturning(
      (
        await tx
          .insert(receiptVersions)
          .values({
            receiptId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? null,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: receiptVersions.id, versionNum: receiptVersions.versionNum })
      )[0],
      "receipt_versions insert (update)",
    );

    const row = assertReturning(
      (
        await tx
          .update(receipts)
          .set({
            occurredAt: nextRow.occurredAt,
            vendor: nextRow.vendor,
            amount: nextRow.amount,
            currency: nextRow.currency,
            notes: nextRow.notes,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(receipts.id, input.id))
          .returning()
      )[0],
      "receipt update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "receipt.updated",
      thingType: "receipt",
      thingId: row.id,
      payload: {
        fromVersion: prevVersionNum,
        toVersion: newVersion.versionNum,
        diffLen: patch.length,
      },
    });

    return row;
  });
}

export async function transitionReceipt(
  db: Db,
  actor: CurrentActor,
  raw: TransitionReceiptInput,
): Promise<Receipt> {
  const input = transitionReceiptInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(receipts)
      .where(eq(receipts.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("receipt", input.id);
    await assertCan(tx, actor.user, "receipts", "write", { entityId: existing.entityId });

    assertTransition(existing.state, input.nextState, { thingType: "receipt" });

    // State flips past `ready` must land outside any period lock — a
    // receipt inside a locked period can't be filed or amended because
    // filing is itself a meaningful mutation of the ledger.
    if (input.nextState === "filed" || input.nextState === "amending") {
      await assertPeriodUnlocked(tx, {
        entityId: existing.entityId,
        occurredAt: existing.occurredAt,
      });
    }

    const [latest] = await tx
      .select({
        versionNum: receiptVersions.versionNum,
        stateSnapshot: receiptVersions.stateSnapshot,
      })
      .from(receiptVersions)
      .where(eq(receiptVersions.receiptId, input.id))
      .orderBy(desc(receiptVersions.versionNum))
      .limit(1);
    if (!latest) throw new Error(`receipt ${input.id} has no version rows — data-integrity bug`);

    const newVersion = assertReturning(
      (
        await tx
          .insert(receiptVersions)
          .values({
            receiptId: input.id,
            versionNum: latest.versionNum + 1,
            stateSnapshot: latest.stateSnapshot,
            // The state itself lives on the parent, not in the snapshot. A
            // transition is recorded as a version row with no payload diff
            // so the timeline has a point to attach the event to; the
            // semantic change is captured in `reason` and the audit event.
            diff: [],
            semanticSummary: input.reason ?? `state → ${input.nextState}`,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: receiptVersions.id, versionNum: receiptVersions.versionNum })
      )[0],
      "receipt_versions insert (transition)",
    );

    const parentPatch: Partial<typeof receipts.$inferInsert> & { updatedAt: Date } = {
      state: input.nextState,
      currentVersionId: newVersion.id,
      updatedAt: new Date(),
    };
    if (input.nextState === "filed") {
      // Always reset filedAt + filedRef when entering `filed`. Without
      // the explicit null, a re-file after `amending` would silently
      // inherit the previous filing's ref/timestamp.
      parentPatch.filedAt = new Date();
      parentPatch.filedRef = input.filedRef ?? null;
    } else if (input.nextState === "amending") {
      // Leaving `filed` → clear both so the next filing starts fresh.
      // The version row still carries the old snapshot for history.
      parentPatch.filedAt = null;
      parentPatch.filedRef = null;
    }

    const row = assertReturning(
      (await tx.update(receipts).set(parentPatch).where(eq(receipts.id, input.id)).returning())[0],
      "receipt transition update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: `receipt.${input.nextState}`,
      thingType: "receipt",
      thingId: row.id,
      payload: {
        fromState: existing.state,
        toState: input.nextState,
        versionNum: newVersion.versionNum,
        ...(input.filedRef ? { filedRef: input.filedRef } : {}),
      },
    });

    return row;
  });
}
