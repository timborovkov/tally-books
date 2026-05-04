import { and, desc, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  entities,
  entityInvoiceCounters,
  invoiceVersions,
  invoices,
  parties,
  type Invoice,
} from "@/db/schema";
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

import { readEntityBranding } from "@/lib/entity-branding";

import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { findPartyByLegalEntityId } from "../parties/queries";

import {
  computeInvoiceTotals,
  createInternalInvoiceInput,
  createInvoiceInput,
  markInvoicePaidInput,
  markInvoiceUnpaidInput,
  parseLineItems,
  transitionInvoiceInput,
  updateInvoiceInput,
  type CreateInternalInvoiceInput,
  type CreateInvoiceInput,
  type InvoiceLineItem,
  type MarkInvoicePaidInput,
  type MarkInvoiceUnpaidInput,
  type TransitionInvoiceInput,
  type UpdateInvoiceInput,
} from "./schema";

/**
 * Domain fields whose changes produce a new version row. Bookkeeping
 * (state, currentVersionId, refresh flags, totalInBase recalc results)
 * lives outside this set so the diff only ever shows real domain edits.
 *
 * `paidAt` and `paymentRef` ARE in here on purpose — payment is a
 * domain event, and showing it in the version timeline is what makes
 * the audit trail useful (vs. a flag mutation invisible in history).
 */
const INVOICE_DOMAIN_FIELDS = [
  "entityId",
  "clientId",
  "number",
  "issueDate",
  "dueDate",
  "lineItems",
  "total",
  "vatTotal",
  "currency",
  "deliveryMethod",
  "sentAt",
  "paidAt",
  "paymentRef",
  "mirrorInvoiceId",
  "description",
] as const satisfies ReadonlyArray<keyof Invoice>;

function readInvoicePrefix(meta: unknown): string {
  return readEntityBranding(meta).invoicePrefix ?? "INV";
}

/**
 * Allocate the next sequential number for `(entityId, year)`. Held under
 * `SELECT … FOR UPDATE` on the counter row — concurrent invoice creates
 * for the same entity/year serialise on the lock and observe a strictly
 * monotonic sequence.
 *
 * The counter row is upserted on first use of a year. Format:
 * `<prefix>-<year>-<padded seq>` (seq zero-padded to 4 digits).
 */
async function assignInvoiceNumber(db: Db, entityId: string, issueDate: Date): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const [entity] = await db
    .select({ metadata: entities.metadata })
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);
  if (!entity) throw new NotFoundError("entity", entityId);
  const prefix = readInvoicePrefix(entity.metadata);

  // Upsert the counter row, then lock and increment. Postgres'
  // ON CONFLICT … RETURNING gives us the existing or freshly-inserted
  // row; the second statement bumps `next_seq` atomically.
  await db
    .insert(entityInvoiceCounters)
    .values({ entityId, year, nextSeq: 1 })
    .onConflictDoNothing({ target: [entityInvoiceCounters.entityId, entityInvoiceCounters.year] });

  const [locked] = await db
    .select({ nextSeq: entityInvoiceCounters.nextSeq })
    .from(entityInvoiceCounters)
    .where(and(eq(entityInvoiceCounters.entityId, entityId), eq(entityInvoiceCounters.year, year)))
    .for("update")
    .limit(1);
  if (!locked) throw new Error("invoice counter row missing after upsert");

  const seq = locked.nextSeq;
  await db
    .update(entityInvoiceCounters)
    .set({ nextSeq: seq + 1, updatedAt: new Date() })
    .where(and(eq(entityInvoiceCounters.entityId, entityId), eq(entityInvoiceCounters.year, year)));

  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

async function assertClientUsable(db: Db, clientId: string): Promise<void> {
  const [row] = await db
    .select({ archivedAt: parties.archivedAt, kind: parties.kind })
    .from(parties)
    .where(eq(parties.id, clientId))
    .limit(1);
  if (!row) throw new NotFoundError("party", clientId);
  if (row.archivedAt) {
    throw new ValidationError("cannot use archived party as client", { clientId });
  }
  // Suppliers/contractors/employees can be invoiced too (e.g. a refund
  // to a supplier as a credit note) — domain doesn't restrict the kind
  // here, only archival.
}

export async function createInvoice(
  db: Db,
  actor: CurrentActor,
  raw: CreateInvoiceInput,
): Promise<Invoice> {
  const input = createInvoiceInput.parse(raw);
  await assertCan(db, actor.user, "invoices", "write", { entityId: input.entityId });

  return db.transaction(async (tx) => {
    await assertCan(tx, actor.user, "invoices", "write", { entityId: input.entityId });
    if (input.issueDate) {
      await assertPeriodUnlocked(tx, { entityId: input.entityId, occurredAt: input.issueDate });
    }
    if (input.clientId) {
      await assertClientUsable(tx, input.clientId);
    }

    const lineItems = input.lineItems;
    const totals = computeInvoiceTotals(lineItems);

    // Number is null in draft state. Manual override allowed at create
    // time only when the caller wants a non-draft initial state — for
    // now we accept the override and rely on the unique constraint.
    const number = input.number ?? null;

    const parent = assertReturning(
      (
        await tx
          .insert(invoices)
          .values({
            entityId: input.entityId,
            clientId: input.clientId ?? null,
            number,
            issueDate: input.issueDate ?? null,
            dueDate: input.dueDate ?? null,
            lineItems,
            total: totals.total,
            vatTotal: totals.vatTotal,
            currency: input.currency,
            deliveryMethod: input.deliveryMethod ?? "pdf",
            description: input.description ?? null,
          })
          .returning()
      )[0],
      "invoice insert",
    );

    const snapshot = pickSnapshot(parent, INVOICE_DOMAIN_FIELDS);

    const version = assertReturning(
      (
        await tx
          .insert(invoiceVersions)
          .values({
            invoiceId: parent.id,
            versionNum: 1,
            stateSnapshot: snapshot,
            diff: [],
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: invoiceVersions.id })
      )[0],
      "invoice_versions insert (v1)",
    );

    const withPointer = assertReturning(
      (
        await tx
          .update(invoices)
          .set({ currentVersionId: version.id, updatedAt: new Date() })
          .where(eq(invoices.id, parent.id))
          .returning()
      )[0],
      "invoice pointer update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.created",
      thingType: "invoice",
      thingId: withPointer.id,
      payload: { versionNum: 1 },
    });

    return withPointer;
  });
}

export async function updateInvoice(
  db: Db,
  actor: CurrentActor,
  raw: UpdateInvoiceInput,
): Promise<Invoice> {
  const input = updateInvoiceInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("invoice", input.id);
    await assertCan(tx, actor.user, "invoices", "write", { entityId: existing.entityId });

    if (existing.state !== "draft" && existing.state !== "ready" && existing.state !== "amending") {
      throw new ConflictError(
        `Cannot edit an invoice in state '${existing.state}'. Transition to 'amending' first.`,
        { invoiceId: input.id, state: existing.state },
      );
    }

    if (input.clientId !== undefined && input.clientId !== null) {
      await assertClientUsable(tx, input.clientId);
    }

    const [latest] = await tx
      .select({ versionNum: invoiceVersions.versionNum })
      .from(invoiceVersions)
      .where(eq(invoiceVersions.invoiceId, input.id))
      .orderBy(desc(invoiceVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    if (input.expectedVersionNum !== undefined && input.expectedVersionNum !== prevVersionNum) {
      throw new VersionConflictError("invoice", input.id, input.expectedVersionNum, prevVersionNum);
    }

    let nextLineItems: InvoiceLineItem[] | null = null;
    let nextTotals: { subtotal: string; vatTotal: string; total: string } | null = null;
    if (input.lineItems !== undefined) {
      nextLineItems = parseLineItems(input.lineItems);
      nextTotals = computeInvoiceTotals(nextLineItems);
    }

    const nextRow: Invoice = {
      ...existing,
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(nextLineItems !== null ? { lineItems: nextLineItems } : {}),
      ...(nextTotals !== null ? { total: nextTotals.total, vatTotal: nextTotals.vatTotal } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    if (existing.issueDate) {
      await assertPeriodUnlocked(tx, {
        entityId: existing.entityId,
        occurredAt: existing.issueDate,
      });
    }
    if (
      nextRow.issueDate &&
      (!existing.issueDate || nextRow.issueDate.getTime() !== existing.issueDate.getTime())
    ) {
      await assertPeriodUnlocked(tx, {
        entityId: nextRow.entityId,
        occurredAt: nextRow.issueDate,
      });
    }

    const prevSnapshot = pickSnapshot(existing, INVOICE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, INVOICE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    if (patch.length === 0) {
      return existing;
    }

    const newVersion = assertReturning(
      (
        await tx
          .insert(invoiceVersions)
          .values({
            invoiceId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? null,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: invoiceVersions.id, versionNum: invoiceVersions.versionNum })
      )[0],
      "invoice_versions insert (update)",
    );

    const row = assertReturning(
      (
        await tx
          .update(invoices)
          .set({
            clientId: nextRow.clientId,
            number: nextRow.number,
            issueDate: nextRow.issueDate,
            dueDate: nextRow.dueDate,
            lineItems: nextRow.lineItems,
            total: nextRow.total,
            vatTotal: nextRow.vatTotal,
            currency: nextRow.currency,
            deliveryMethod: nextRow.deliveryMethod,
            description: nextRow.description,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, input.id))
          .returning()
      )[0],
      "invoice update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.updated",
      thingType: "invoice",
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

export async function transitionInvoice(
  db: Db,
  actor: CurrentActor,
  raw: TransitionInvoiceInput,
): Promise<Invoice> {
  const input = transitionInvoiceInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("invoice", input.id);
    await assertCan(tx, actor.user, "invoices", "write", { entityId: existing.entityId });

    assertTransition(existing.state, input.nextState, { thingType: "invoice" });

    // Period-lock guard for any transition that touches a filed-period
    // row. `sent → filed` is the canonical "book it" path; `amending`
    // and direct voids of filed/amending are also period-sensitive.
    const touchesPeriodLock =
      input.nextState === "filed" ||
      input.nextState === "amending" ||
      (existing.state === "amending" && input.nextState === "void") ||
      (existing.state === "filed" && input.nextState === "void");
    if (touchesPeriodLock && existing.issueDate) {
      await assertPeriodUnlocked(tx, {
        entityId: existing.entityId,
        occurredAt: existing.issueDate,
      });
    }

    // Number assignment: required for ready/sent/filed; null in draft/void.
    // Auto-assign on the first transition out of draft if not already set.
    let nextNumber = existing.number;
    if (
      (input.nextState === "ready" || input.nextState === "sent" || input.nextState === "filed") &&
      !existing.number
    ) {
      const issueDate = existing.issueDate ?? new Date();
      nextNumber = await assignInvoiceNumber(tx, existing.entityId, issueDate);
    }
    if (input.nextState === "draft") {
      // Going back to draft drops the number — it's reissued on the
      // next forward transition. Keeps the unique constraint clean
      // and lets users rework drafts without burning numbers.
      nextNumber = null;
    }

    const [latest] = await tx
      .select({
        versionNum: invoiceVersions.versionNum,
      })
      .from(invoiceVersions)
      .where(eq(invoiceVersions.invoiceId, input.id))
      .orderBy(desc(invoiceVersions.versionNum))
      .limit(1);
    if (!latest) throw new Error(`invoice ${input.id} has no version rows — data-integrity bug`);

    // Build the snapshot for the version row off the *post-transition*
    // values so number changes ride in the version diff alongside state.
    const sentAt = input.nextState === "sent" && !existing.sentAt ? new Date() : existing.sentAt;
    const nextRow: Invoice = {
      ...existing,
      number: nextNumber,
      sentAt,
    };
    const prevSnapshot = pickSnapshot(existing, INVOICE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, INVOICE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    const newVersion = assertReturning(
      (
        await tx
          .insert(invoiceVersions)
          .values({
            invoiceId: input.id,
            versionNum: latest.versionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? `state → ${input.nextState}`,
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: invoiceVersions.id, versionNum: invoiceVersions.versionNum })
      )[0],
      "invoice_versions insert (transition)",
    );

    const parentPatch: Partial<typeof invoices.$inferInsert> & { updatedAt: Date } = {
      state: input.nextState,
      currentVersionId: newVersion.id,
      updatedAt: new Date(),
      number: nextNumber,
      sentAt,
    };
    if (input.nextState === "filed") {
      parentPatch.filedAt = new Date();
      parentPatch.filedRef = input.filedRef ?? null;
    } else if (input.nextState === "amending") {
      parentPatch.filedAt = null;
      parentPatch.filedRef = null;
    }

    const row = assertReturning(
      (await tx.update(invoices).set(parentPatch).where(eq(invoices.id, input.id)).returning())[0],
      "invoice transition update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: `invoice.${input.nextState}`,
      thingType: "invoice",
      thingId: row.id,
      payload: {
        fromState: existing.state,
        toState: input.nextState,
        versionNum: newVersion.versionNum,
        ...(nextNumber && nextNumber !== existing.number ? { numberAssigned: nextNumber } : {}),
        ...(input.filedRef ? { filedRef: input.filedRef } : {}),
      },
    });

    return row;
  });
}

/**
 * Manual "I got paid" flag. Sets `paid_at` and (optionally) a payment
 * reference (bank tx id, "stripe ch_…", etc.). Writes a version row so
 * payment history is visible in the timeline.
 *
 * Books update in v0.2 = the (still-TBD) income statement query reads
 * `paid_at` once it ships. No `bank_transactions` row is created today
 * (that table arrives with the bank-sync work). When that integration
 * lands, this mutation gets an optional `linked_transaction_id` arg
 * and the existing `paid_at` semantics keep working.
 */
export async function markInvoicePaid(
  db: Db,
  actor: CurrentActor,
  raw: MarkInvoicePaidInput,
): Promise<Invoice> {
  const input = markInvoicePaidInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("invoice", input.id);
    await assertCan(tx, actor.user, "invoices", "write", { entityId: existing.entityId });

    if (existing.paidAt !== null) {
      throw new ConflictError(`Invoice already marked paid at ${existing.paidAt.toISOString()}.`, {
        invoiceId: input.id,
        paidAt: existing.paidAt.toISOString(),
      });
    }
    if (existing.state === "draft" || existing.state === "void") {
      throw new ConflictError(
        `Cannot mark a ${existing.state} invoice as paid. Transition out of draft/void first.`,
        { invoiceId: input.id, state: existing.state },
      );
    }

    const paidAt = input.paidAt ?? new Date();
    const paymentRef = input.paymentRef ?? null;

    const [latest] = await tx
      .select({ versionNum: invoiceVersions.versionNum })
      .from(invoiceVersions)
      .where(eq(invoiceVersions.invoiceId, input.id))
      .orderBy(desc(invoiceVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    const nextRow: Invoice = { ...existing, paidAt, paymentRef };
    const prevSnapshot = pickSnapshot(existing, INVOICE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, INVOICE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    const newVersion = assertReturning(
      (
        await tx
          .insert(invoiceVersions)
          .values({
            invoiceId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? "Marked paid",
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: invoiceVersions.id, versionNum: invoiceVersions.versionNum })
      )[0],
      "invoice_versions insert (mark paid)",
    );

    const row = assertReturning(
      (
        await tx
          .update(invoices)
          .set({
            paidAt,
            paymentRef,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, input.id))
          .returning()
      )[0],
      "invoice mark paid",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.paid",
      thingType: "invoice",
      thingId: row.id,
      payload: {
        versionNum: newVersion.versionNum,
        paidAt: paidAt.toISOString(),
        paymentRef,
      },
    });

    return row;
  });
}

export async function markInvoiceUnpaid(
  db: Db,
  actor: CurrentActor,
  raw: MarkInvoiceUnpaidInput,
): Promise<Invoice> {
  const input = markInvoiceUnpaidInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("invoice", input.id);
    await assertCan(tx, actor.user, "invoices", "write", { entityId: existing.entityId });

    if (existing.paidAt === null) {
      throw new ConflictError("Invoice is not currently marked paid.", { invoiceId: input.id });
    }

    const [latest] = await tx
      .select({ versionNum: invoiceVersions.versionNum })
      .from(invoiceVersions)
      .where(eq(invoiceVersions.invoiceId, input.id))
      .orderBy(desc(invoiceVersions.versionNum))
      .limit(1);
    const prevVersionNum = latest?.versionNum ?? 0;

    const nextRow: Invoice = { ...existing, paidAt: null, paymentRef: null };
    const prevSnapshot = pickSnapshot(existing, INVOICE_DOMAIN_FIELDS);
    const nextSnapshot = pickSnapshot(nextRow, INVOICE_DOMAIN_FIELDS);
    const patch = createPatch(prevSnapshot, nextSnapshot);

    const newVersion = assertReturning(
      (
        await tx
          .insert(invoiceVersions)
          .values({
            invoiceId: input.id,
            versionNum: prevVersionNum + 1,
            stateSnapshot: nextSnapshot,
            diff: patch,
            semanticSummary: input.reason ?? "Unmarked paid",
            reason: input.reason ?? null,
            actorId: actor.userId,
            actorKind: actor.kind,
          })
          .returning({ id: invoiceVersions.id, versionNum: invoiceVersions.versionNum })
      )[0],
      "invoice_versions insert (unmark paid)",
    );

    const row = assertReturning(
      (
        await tx
          .update(invoices)
          .set({
            paidAt: null,
            paymentRef: null,
            currentVersionId: newVersion.id,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, input.id))
          .returning()
      )[0],
      "invoice unmark paid",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.unpaid",
      thingType: "invoice",
      thingId: row.id,
      payload: { versionNum: newVersion.versionNum },
    });

    return row;
  });
}

/**
 * Find or create a counterparty `parties` row that represents another
 * tally entity. Used by the internal-invoice mirror flow. Matches by
 * `legal_entity_id` (the entity's `business_id`) when set, falling back
 * to a metadata flag `mirroredEntityId` so personal pseudo-entities and
 * entities without a registered business id still resolve to a stable
 * row.
 */
async function findOrCreateMirrorParty(
  db: Db,
  entityRow: { id: string; name: string; businessId: string | null },
  kind: "client" | "supplier",
): Promise<typeof parties.$inferSelect> {
  if (entityRow.businessId) {
    const found = await findPartyByLegalEntityId(db, entityRow.businessId, kind);
    if (found) return found;
  }

  // Fall back to metadata-flagged match. Done as a literal jsonb path
  // query — keep this simple, it's only used at mirror creation time.
  const [byMeta] = await db
    .select()
    .from(parties)
    .where(
      and(
        eq(parties.kind, kind),
        sql`${parties.metadata} ->> 'mirroredEntityId' = ${entityRow.id}`,
      ),
    )
    .limit(1);
  if (byMeta) return byMeta;

  const [created] = await db
    .insert(parties)
    .values({
      kind,
      name: entityRow.name,
      legalEntityId: entityRow.businessId ?? null,
      metadata: { mirroredEntityId: entityRow.id },
    })
    .returning();
  if (!created) throw new Error("mirror party insert returned no row");
  return created;
}

/**
 * Create an internal entity → entity invoice. Writes both sides in one
 * transaction:
 *
 *   - Seller side (entityId = sellerEntityId, kind=outgoing): the
 *     normal billing-side invoice.
 *   - Buyer side (entityId = buyerEntityId): a mirror row whose
 *     description is auto-prefixed with the seller's reference.
 *
 * Both rows cross-link via `mirror_invoice_id`. They start in `draft`
 * with no number; the user transitions each side independently (the
 * seller normally sends and files; the buyer normally just files).
 *
 * No FX magic in v0.2 — both sides ride the same `currency`.
 */
export async function createInternalInvoice(
  db: Db,
  actor: CurrentActor,
  raw: CreateInternalInvoiceInput,
): Promise<{ seller: Invoice; buyer: Invoice }> {
  const input = createInternalInvoiceInput.parse(raw);
  if (input.sellerEntityId === input.buyerEntityId) {
    throw new ValidationError("seller and buyer must differ", {
      sellerEntityId: input.sellerEntityId,
      buyerEntityId: input.buyerEntityId,
    });
  }
  await assertCan(db, actor.user, "invoices", "write", { entityId: input.sellerEntityId });
  await assertCan(db, actor.user, "invoices", "write", { entityId: input.buyerEntityId });

  return db.transaction(async (tx) => {
    const [sellerEntity] = await tx
      .select({ id: entities.id, name: entities.name, businessId: entities.businessId })
      .from(entities)
      .where(eq(entities.id, input.sellerEntityId))
      .limit(1);
    if (!sellerEntity) throw new NotFoundError("entity", input.sellerEntityId);

    const [buyerEntity] = await tx
      .select({ id: entities.id, name: entities.name, businessId: entities.businessId })
      .from(entities)
      .where(eq(entities.id, input.buyerEntityId))
      .limit(1);
    if (!buyerEntity) throw new NotFoundError("entity", input.buyerEntityId);

    if (input.issueDate) {
      await assertPeriodUnlocked(tx, {
        entityId: sellerEntity.id,
        occurredAt: input.issueDate,
      });
      await assertPeriodUnlocked(tx, {
        entityId: buyerEntity.id,
        occurredAt: input.issueDate,
      });
    }

    // Resolve / create the counterparty rows. Each tally entity
    // appears as a `client` party in the OTHER entity's books, and as
    // a `supplier` party in this entity's books on the buyer side.
    const sellerSideClient = await findOrCreateMirrorParty(tx, buyerEntity, "client");
    const buyerSideSupplier = await findOrCreateMirrorParty(tx, sellerEntity, "supplier");

    const totals = computeInvoiceTotals(input.lineItems);
    const baseDescription = input.description ?? null;

    const sellerParent = assertReturning(
      (
        await tx
          .insert(invoices)
          .values({
            entityId: sellerEntity.id,
            clientId: sellerSideClient.id,
            issueDate: input.issueDate ?? null,
            dueDate: input.dueDate ?? null,
            lineItems: input.lineItems,
            total: totals.total,
            vatTotal: totals.vatTotal,
            currency: input.currency,
            deliveryMethod: input.deliveryMethod ?? "manual",
            description: baseDescription,
          })
          .returning()
      )[0],
      "internal invoice seller insert",
    );

    const buyerDescription = baseDescription
      ? `Mirror of ${sellerEntity.name}: ${baseDescription}`
      : `Mirror of ${sellerEntity.name}`;

    const buyerParent = assertReturning(
      (
        await tx
          .insert(invoices)
          .values({
            entityId: buyerEntity.id,
            clientId: buyerSideSupplier.id,
            issueDate: input.issueDate ?? null,
            dueDate: input.dueDate ?? null,
            lineItems: input.lineItems,
            total: totals.total,
            vatTotal: totals.vatTotal,
            currency: input.currency,
            deliveryMethod: input.deliveryMethod ?? "manual",
            description: buyerDescription,
            mirrorInvoiceId: sellerParent.id,
          })
          .returning()
      )[0],
      "internal invoice buyer insert",
    );

    // Link seller → buyer now that buyer's id exists. mirror_invoice_id
    // is a self-FK with ON DELETE SET NULL; keeping both pointers means
    // either side can navigate to its mirror without a join through the
    // buyer's row.
    const sellerLinked = assertReturning(
      (
        await tx
          .update(invoices)
          .set({ mirrorInvoiceId: buyerParent.id, updatedAt: new Date() })
          .where(eq(invoices.id, sellerParent.id))
          .returning()
      )[0],
      "internal invoice seller link update",
    );

    // Insert v1 + pointer for both sides.
    for (const parent of [sellerLinked, buyerParent]) {
      const snapshot = pickSnapshot(parent, INVOICE_DOMAIN_FIELDS);
      const version = assertReturning(
        (
          await tx
            .insert(invoiceVersions)
            .values({
              invoiceId: parent.id,
              versionNum: 1,
              stateSnapshot: snapshot,
              diff: [],
              actorId: actor.userId,
              actorKind: actor.kind,
            })
            .returning({ id: invoiceVersions.id })
        )[0],
        "internal invoice version insert",
      );
      await tx
        .update(invoices)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(invoices.id, parent.id));
    }

    const [sellerRow] = await tx.select().from(invoices).where(eq(invoices.id, sellerLinked.id));
    const [buyerRow] = await tx.select().from(invoices).where(eq(invoices.id, buyerParent.id));
    if (!sellerRow || !buyerRow) {
      throw new Error("internal invoice rows missing after insert");
    }

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.created",
      thingType: "invoice",
      thingId: sellerRow.id,
      payload: { versionNum: 1, mirroredFrom: buyerRow.id, role: "seller" },
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "invoice.created",
      thingType: "invoice",
      thingId: buyerRow.id,
      payload: { versionNum: 1, mirroredFrom: sellerRow.id, role: "buyer" },
    });

    return { seller: sellerRow, buyer: buyerRow };
  });
}
