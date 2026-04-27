import { desc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, expenses, expenseVersions, receipts, type Expense } from "@/db/schema";
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

import { ConflictError, NotFoundError, ValidationError } from "../errors";

import {
  createExpenseInput,
  linkReceiptInput,
  markReimbursedInput,
  transitionExpenseInput,
  updateExpenseInput,
  type CreateExpenseInput,
  type LinkReceiptInput,
  type MarkReimbursedInput,
  type TransitionExpenseInput,
  type UpdateExpenseInput,
} from "./schema";

/**
 * Fields whose changes produce a new version row. Bookkeeping columns
 * (state, currentVersionId, timestamps, refresh flags, amountInBase
 * recalc results) are NOT here — they ride their own paths so the
 * versioned diff only ever shows real domain edits. Kept explicit for
 * the same reason as RECEIPT_DOMAIN_FIELDS: review-as-policy.
 */
const EXPENSE_DOMAIN_FIELDS = [
  "entityId",
  "categoryId",
  "vendor",
  "occurredAt",
  "amount",
  "currency",
  "vatAmount",
  "vatRate",
  "vatDeductible",
  "paidBy",
  "reimbursementStatus",
  "linkedReceiptId",
  "linkedTransactionId",
  "tripId",
  "description",
] as const satisfies ReadonlyArray<keyof Expense>;

/**
 * Resolves the initial reimbursement status from `paid_by`.
 * `personal_reimbursable` defaults to `pending` (someone owes the user);
 * everything else stays `not_applicable`.
 */
function defaultReimbursementStatus(paidBy: Expense["paidBy"]): Expense["reimbursementStatus"] {
  return paidBy === "personal_reimbursable" ? "pending" : "not_applicable";
}

/**
 * Validate that a category is usable from this entity (global, or
 * scoped to the entity) and that its kind is `expense`. Anything else
 * is a domain error rather than a raw FK / constraint failure.
 */
async function assertCategoryUsable(db: Db, categoryId: string, entityId: string): Promise<void> {
  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat) throw new NotFoundError("category", categoryId);
  if (cat.archivedAt) {
    throw new ValidationError("cannot use archived category", { categoryId });
  }
  if (cat.kind !== "expense") {
    throw new ValidationError("category kind must be 'expense'", {
      categoryId,
      kind: cat.kind,
    });
  }
  if (cat.scope === "entity" && cat.entityId !== entityId) {
    throw new ValidationError("category belongs to a different entity", {
      categoryId,
      categoryEntityId: cat.entityId,
      entityId,
    });
  }
  if (cat.scope === "personal") {
    throw new ValidationError("personal-scope categories cannot be used on entity expenses", {
      categoryId,
    });
  }
}

/**
 * Validate that a receipt belongs to the same entity as the expense.
 * Same-entity-only is by design: a receipt-expense link that crosses
 * entities would also cross period-lock scope, which the lock contract
 * explicitly forbids.
 */
async function assertReceiptSameEntity(db: Db, receiptId: string, entityId: string): Promise<void> {
  const [r] = await db
    .select({ entityId: receipts.entityId })
    .from(receipts)
    .where(eq(receipts.id, receiptId))
    .limit(1);
  if (!r) throw new NotFoundError("receipt", receiptId);
  if (r.entityId !== entityId) {
    throw new ValidationError("receipt belongs to a different entity", {
      receiptId,
      receiptEntityId: r.entityId,
      entityId,
    });
  }
}

export async function createExpense(
  db: Db,
  actor: CurrentActor,
  raw: CreateExpenseInput,
): Promise<Expense> {
  const input = createExpenseInput.parse(raw);
  await assertCan(db, actor.user, "expenses", "write", { entityId: input.entityId });

  return db.transaction(async (tx) => {
    await assertPeriodUnlocked(tx, {
      entityId: input.entityId,
      occurredAt: input.occurredAt,
    });

    if (input.categoryId) {
      await assertCategoryUsable(tx, input.categoryId, input.entityId);
    }
    if (input.linkedReceiptId) {
      await assertReceiptSameEntity(tx, input.linkedReceiptId, input.entityId);
    }

    const paidBy = input.paidBy ?? "entity";

    const parent = assertReturning(
      (
        await tx
          .insert(expenses)
          .values({
            entityId: input.entityId,
            categoryId: input.categoryId ?? null,
            vendor: input.vendor ?? null,
            occurredAt: input.occurredAt,
            amount: input.amount,
            currency: input.currency,
            vatAmount: input.vatAmount ?? null,
            vatRate: input.vatRate ?? null,
            vatDeductible: input.vatDeductible ?? true,
            paidBy,
            reimbursementStatus: defaultReimbursementStatus(paidBy),
            linkedReceiptId: input.linkedReceiptId ?? null,
            description: input.description ?? null,
          })
          .returning()
      )[0],
      "expense insert",
    );

    const snapshot = pickSnapshot(parent, EXPENSE_DOMAIN_FIELDS);

    const version = assertReturning(
      (
        await tx
          .insert(expenseVersions)
          .values({
            expenseId: parent.id,
            versionNum: 1,
            stateSnapshot: snapshot,
            diff: [],
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: expenseVersions.id })
      )[0],
      "expense_versions insert (v1)",
    );

    const withPointer = assertReturning(
      (
        await tx
          .update(expenses)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(expenses.id, parent.id))
          .returning()
      )[0],
      "expense pointer update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "expense.created",
      thingType: "expense",
      thingId: withPointer.id,
      payload: { versionNum: 1 },
    });

    return withPointer;
  });
}

export async function updateExpense(
  db: Db,
  actor: CurrentActor,
  raw: UpdateExpenseInput,
): Promise<Expense> {
  const input = updateExpenseInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("expense", input.id);
    await assertCan(tx, actor.user, "expenses", "write", { entityId: existing.entityId });

    if (existing.state !== "draft" && existing.state !== "ready" && existing.state !== "amending") {
      throw new ConflictError(
        `Cannot edit an expense in state '${existing.state}'. Transition to 'amending' first.`,
        { expenseId: input.id, state: existing.state },
      );
    }

    if (input.categoryId !== undefined && input.categoryId !== null) {
      await assertCategoryUsable(tx, input.categoryId, existing.entityId);
    }

    const [latest] = await tx
      .select({ versionNum: expenseVersions.versionNum })
      .from(expenseVersions)
      .where(eq(expenseVersions.expenseId, input.id))
      .orderBy(desc(expenseVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    if (input.expectedVersionNum !== undefined && input.expectedVersionNum !== prevVersionNum) {
      throw new VersionConflictError("expense", input.id, input.expectedVersionNum, prevVersionNum);
    }

    // Switching to/from personal_reimbursable resets reimbursement_status
    // so the column always agrees with paid_by. Once a row is `paid_back`
    // this *would* clobber the history bit — but the history is in the
    // version row, so the reset is cheap and the new state is honest.
    let nextReimbursementStatus = existing.reimbursementStatus;
    if (input.paidBy !== undefined && input.paidBy !== existing.paidBy) {
      nextReimbursementStatus = defaultReimbursementStatus(input.paidBy);
    }

    const nextRow: Expense = {
      ...existing,
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.vatAmount !== undefined ? { vatAmount: input.vatAmount } : {}),
      ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
      ...(input.vatDeductible !== undefined ? { vatDeductible: input.vatDeductible } : {}),
      ...(input.paidBy !== undefined ? { paidBy: input.paidBy } : {}),
      reimbursementStatus: nextReimbursementStatus,
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

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

    const prevSnapshot = pickSnapshot(existing, EXPENSE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, EXPENSE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    if (patch.length === 0) {
      return existing;
    }

    const newVersion = assertReturning(
      (
        await tx
          .insert(expenseVersions)
          .values({
            expenseId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? null,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: expenseVersions.id, versionNum: expenseVersions.versionNum })
      )[0],
      "expense_versions insert (update)",
    );

    const row = assertReturning(
      (
        await tx
          .update(expenses)
          .set({
            categoryId: nextRow.categoryId,
            vendor: nextRow.vendor,
            occurredAt: nextRow.occurredAt,
            amount: nextRow.amount,
            currency: nextRow.currency,
            vatAmount: nextRow.vatAmount,
            vatRate: nextRow.vatRate,
            vatDeductible: nextRow.vatDeductible,
            paidBy: nextRow.paidBy,
            reimbursementStatus: nextRow.reimbursementStatus,
            description: nextRow.description,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, input.id))
          .returning()
      )[0],
      "expense update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "expense.updated",
      thingType: "expense",
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

export async function transitionExpense(
  db: Db,
  actor: CurrentActor,
  raw: TransitionExpenseInput,
): Promise<Expense> {
  const input = transitionExpenseInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("expense", input.id);
    await assertCan(tx, actor.user, "expenses", "write", { entityId: existing.entityId });

    assertTransition(existing.state, input.nextState, { thingType: "expense" });

    const touchesFiledLedger =
      input.nextState === "filed" ||
      input.nextState === "amending" ||
      (existing.state === "amending" && input.nextState === "void");
    if (touchesFiledLedger) {
      await assertPeriodUnlocked(tx, {
        entityId: existing.entityId,
        occurredAt: existing.occurredAt,
      });
    }

    const [latest] = await tx
      .select({
        versionNum: expenseVersions.versionNum,
        stateSnapshot: expenseVersions.stateSnapshot,
      })
      .from(expenseVersions)
      .where(eq(expenseVersions.expenseId, input.id))
      .orderBy(desc(expenseVersions.versionNum))
      .limit(1);
    if (!latest) throw new Error(`expense ${input.id} has no version rows — data-integrity bug`);

    const newVersion = assertReturning(
      (
        await tx
          .insert(expenseVersions)
          .values({
            expenseId: input.id,
            versionNum: latest.versionNum + 1,
            stateSnapshot: latest.stateSnapshot,
            diff: [],
            semanticSummary: input.reason ?? `state → ${input.nextState}`,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: expenseVersions.id, versionNum: expenseVersions.versionNum })
      )[0],
      "expense_versions insert (transition)",
    );

    const parentPatch: Partial<typeof expenses.$inferInsert> & { updatedAt: Date } = {
      state: input.nextState,
      currentVersionId: newVersion.id,
      updatedAt: new Date(),
    };
    if (input.nextState === "filed") {
      parentPatch.filedAt = new Date();
      parentPatch.filedRef = input.filedRef ?? null;
    } else if (input.nextState === "amending") {
      parentPatch.filedAt = null;
      parentPatch.filedRef = null;
    }

    const row = assertReturning(
      (await tx.update(expenses).set(parentPatch).where(eq(expenses.id, input.id)).returning())[0],
      "expense transition update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: `expense.${input.nextState}`,
      thingType: "expense",
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

/**
 * Link or unlink a receipt. Implemented as a domain mutation (not a
 * thin updateExpense wrapper) because:
 *   - same-entity validation belongs here, not in update's broad
 *     diff path;
 *   - it has its own audit verb (`expense.receipt_linked` /
 *     `expense.receipt_unlinked`) that's nicer to read than a generic
 *     `expense.updated` in the timeline.
 *
 * State gate matches updateExpense: filed/void/sent rows can't change
 * their receipt link without going through `amending` first. Period
 * lock applies for the same reason.
 */
export async function linkReceipt(
  db: Db,
  actor: CurrentActor,
  raw: LinkReceiptInput,
): Promise<Expense> {
  const input = linkReceiptInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, input.expenseId))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("expense", input.expenseId);
    await assertCan(tx, actor.user, "expenses", "write", { entityId: existing.entityId });

    if (existing.state !== "draft" && existing.state !== "ready" && existing.state !== "amending") {
      throw new ConflictError(
        `Cannot change receipt link on an expense in state '${existing.state}'.`,
        { expenseId: input.expenseId, state: existing.state },
      );
    }

    await assertPeriodUnlocked(tx, {
      entityId: existing.entityId,
      occurredAt: existing.occurredAt,
    });

    if (input.receiptId) {
      await assertReceiptSameEntity(tx, input.receiptId, existing.entityId);
    }

    if (existing.linkedReceiptId === input.receiptId) {
      return existing;
    }

    const [latest] = await tx
      .select({ versionNum: expenseVersions.versionNum })
      .from(expenseVersions)
      .where(eq(expenseVersions.expenseId, input.expenseId))
      .orderBy(desc(expenseVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    const nextRow: Expense = { ...existing, linkedReceiptId: input.receiptId };
    const prevSnapshot = pickSnapshot(existing, EXPENSE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, EXPENSE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    const verb = input.receiptId ? "expense.receipt_linked" : "expense.receipt_unlinked";
    const summary = input.reason ?? (input.receiptId ? "Linked receipt" : "Unlinked receipt");

    const newVersion = assertReturning(
      (
        await tx
          .insert(expenseVersions)
          .values({
            expenseId: input.expenseId,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: summary,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: expenseVersions.id, versionNum: expenseVersions.versionNum })
      )[0],
      "expense_versions insert (link receipt)",
    );

    const row = assertReturning(
      (
        await tx
          .update(expenses)
          .set({
            linkedReceiptId: input.receiptId,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, input.expenseId))
          .returning()
      )[0],
      "expense receipt link update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: verb,
      thingType: "expense",
      thingId: row.id,
      payload: {
        receiptId: input.receiptId,
        versionNum: newVersion.versionNum,
      },
    });

    return row;
  });
}

/**
 * Mark a personal-reimbursable expense as paid back. Writes a version
 * row with a clear semantic summary so the timeline shows when the
 * money moved (the actual bank-tx link will arrive in v0.3 — for now
 * this is the manual marker).
 *
 * Idempotent at the request level: calling it twice on a `paid_back`
 * row throws ConflictError instead of silently writing duplicate
 * versions.
 */
export async function markReimbursed(
  db: Db,
  actor: CurrentActor,
  raw: MarkReimbursedInput,
): Promise<Expense> {
  const input = markReimbursedInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("expense", input.id);
    await assertCan(tx, actor.user, "expenses", "write", { entityId: existing.entityId });

    if (existing.paidBy !== "personal_reimbursable") {
      throw new ConflictError(
        `Only personal_reimbursable expenses can be marked reimbursed (paid_by='${existing.paidBy}').`,
        { expenseId: input.id, paidBy: existing.paidBy },
      );
    }
    if (existing.reimbursementStatus !== "pending") {
      throw new ConflictError(
        `Expense reimbursement is already '${existing.reimbursementStatus}'.`,
        { expenseId: input.id, reimbursementStatus: existing.reimbursementStatus },
      );
    }

    const [latest] = await tx
      .select({ versionNum: expenseVersions.versionNum })
      .from(expenseVersions)
      .where(eq(expenseVersions.expenseId, input.id))
      .orderBy(desc(expenseVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    const nextRow: Expense = { ...existing, reimbursementStatus: "paid_back" };
    const prevSnapshot = pickSnapshot(existing, EXPENSE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, EXPENSE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    const newVersion = assertReturning(
      (
        await tx
          .insert(expenseVersions)
          .values({
            expenseId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? "Marked reimbursed",
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: expenseVersions.id, versionNum: expenseVersions.versionNum })
      )[0],
      "expense_versions insert (mark reimbursed)",
    );

    const row = assertReturning(
      (
        await tx
          .update(expenses)
          .set({
            reimbursementStatus: "paid_back",
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, input.id))
          .returning()
      )[0],
      "expense mark reimbursed",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "expense.reimbursed",
      thingType: "expense",
      thingId: row.id,
      payload: { versionNum: newVersion.versionNum },
    });

    return row;
  });
}
