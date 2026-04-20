import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { blobs } from "./blobs";
import { entities } from "./entities";
import { intakeOcrStatusEnum, intakeStatusEnum, intakeTargetFlowEnum } from "./enums";
import { receipts } from "./receipts";
import { users } from "./users";

/**
 * Unified cross-entity intake queue.
 *
 * Every uploaded scan lands here first, not on `receipts`. The
 * intake item carries the workflow state (OCR status, extraction
 * payload, routing target) that doesn't belong on the domain row —
 * a receipt is an accounting fact, an intake_item is a piece of
 * operational work. Once the user confirms routing, a downstream
 * Thing is created and the intake item becomes its origin anchor
 * (see `receiptId` below).
 *
 * Routing can target multiple downstream flows: expense (→ receipt +
 * eventually expense), trip (→ trip evidence), mileage, benefit,
 * compliance evidence. Only `expense` has a real downstream Thing
 * today; the other columns for expenseId, tripId, etc. come in later
 * milestones.
 *
 * Wrong-route recovery — see §"reRoute" in the domain module.
 * `previousRouteSnapshot` stashes the last routing choice before a
 * re-route so the audit trail + agent can explain "this was on
 * Entity A as an expense, we moved it to Personal because …".
 *
 * Not versioned: the intake workflow is operational metadata, not
 * accounting-factual. The `audit_log` already captures intake
 * actions verbosely (intake.uploaded, intake.routed, intake.confirmed,
 * intake.wrong_route, intake.re_routed, …).
 */
export const intakeItems = pgTable(
  "intake_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),

    // ── Source ────────────────────────────────────────────────────
    blobId: text("blob_id")
      .notNull()
      .references(() => blobs.id, { onDelete: "restrict" }),
    uploadedById: text("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),

    // ── Workflow status ────────────────────────────────────────────
    status: intakeStatusEnum("status").notNull().default("new"),

    // ── Routing choice (null = undecided) ──────────────────────────
    // Business vs personal. When `isPersonal=true`, `entityId` stays
    // null — the personal pseudo-entity is a row in `entities` today
    // but we keep the flag explicit so personal routing never
    // accidentally attaches to the "wrong" entity when a user has
    // multiple personal scopes in the future.
    isPersonal: text("is_personal"), // null/"true"/"false" — text tri-state
    entityId: text("entity_id").references(() => entities.id, { onDelete: "restrict" }),
    targetFlow: intakeTargetFlowEnum("target_flow"),

    // ── Downstream artifact (nullable; filled when status='confirmed') ──
    // Only `receiptId` exists today. `expenseId`, `tripId`, … land
    // alongside those Things' domain modules in later milestones.
    receiptId: text("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),

    // ── OCR / extraction ───────────────────────────────────────────
    ocrStatus: intakeOcrStatusEnum("ocr_status").notNull().default("queued"),
    ocrError: text("ocr_error"),
    // Shape = ReceiptExtraction from @/lib/ai (or null when OCR is
    // queued / skipped / failed). Stored as jsonb so the review UI
    // can present per-field confidences without a second query.
    extraction: jsonb("extraction"),
    // Model id / provider that produced `extraction`. Audit-relevant
    // when we ship multiple provider backends later — "which model
    // misread this vendor name?" needs a direct answer.
    extractionProvider: text("extraction_provider"),

    // ── Wrong-route recovery ──────────────────────────────────────
    // Full routing snapshot from immediately before the most recent
    // re-route. Structured: { isPersonal, entityId, targetFlow,
    // receiptId, routedAt, routedByUserId }. Used by the timeline UI
    // and by downstream-evaluation signals (flag this receipt for
    // recalc, tell the agent "this was re-routed, mentioning the
    // prior scope in explanations").
    previousRouteSnapshot: jsonb("previous_route_snapshot"),

    // ── Bookkeeping ────────────────────────────────────────────────
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Inbox view hot path: filter by status + sort by uploadedAt desc.
    index("intake_items_status_uploaded_idx").on(t.status, t.uploadedAt.desc()),
    // Entity-scoped filters in the inbox.
    index("intake_items_entity_idx").on(t.entityId),
    // Reverse-lookup from receipt → its originating intake item.
    index("intake_items_receipt_idx").on(t.receiptId),
  ],
);

export type IntakeItem = typeof intakeItems.$inferSelect;
export type NewIntakeItem = typeof intakeItems.$inferInsert;
