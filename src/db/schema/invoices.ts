import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { entities } from "./entities";
import { actorKindEnum, invoiceDeliveryMethodEnum } from "./enums";
import { parties } from "./parties";
import { users } from "./users";
import { versionedColumns } from "./versioning";

/**
 * Outgoing invoices — money the entity bills out. docs/data-model.md §8.4.
 *
 * Versioned per the receipt/expense pattern. Domain columns plus the
 * `versionedColumns()` mixin and a hand-wired DEFERRABLE FK on
 * `current_version_id` (drizzle-kit can't emit DEFERRABLE; the migration
 * is hand-edited to mutate the FK after CREATE TABLE).
 *
 * `line_items` is `jsonb` typed as `InvoiceLineItem[]` (see the
 * sibling type in the domain layer). Lives inline rather than in its
 * own child table because:
 *   - line items are inseparable from the invoice — no cross-entity
 *     references, no independent lifecycle.
 *   - editing them as a unit is the natural composer flow; rewriting
 *     the whole array on save is simpler than reconciling row-level
 *     ids in a child table.
 *   - the snapshot/diff machinery already serialises the column to
 *     JSON, so structured-as-JSONB matches what versioning sees.
 *
 * `mirror_invoice_id` is a self-FK with ON DELETE SET NULL: voiding /
 * deleting one side of an internal-invoice pair must not cascade-delete
 * the other side (the invoice paper trail outlives the link).
 */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    clientId: text("client_id").references(() => parties.id, { onDelete: "restrict" }),
    // Nullable until the invoice transitions out of draft. The CHECK
    // constraint below enforces the business rule.
    number: text("number"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    lineItems: jsonb("line_items")
      .notNull()
      .default(sql`'[]'::jsonb`),
    total: numeric("total", { precision: 20, scale: 4 }),
    vatTotal: numeric("vat_total", { precision: 20, scale: 4 }),
    currency: text("currency").notNull(),
    // Filled by the FX recalc worker (v0.3). NULL until then.
    totalInBase: numeric("total_in_base", { precision: 20, scale: 4 }),
    deliveryMethod: invoiceDeliveryMethodEnum("delivery_method").notNull().default("pdf"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentRef: text("payment_ref"),
    // ON DELETE SET NULL — see header comment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mirrorInvoiceId: text("mirror_invoice_id").references((): any => invoices.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    // Hand-wired DEFERRABLE FK in migration SQL. See receipts.ts and
    // expenses.ts for the same pattern.
    currentVersionId: text("current_version_id"),
    ...versionedColumns(),
  },
  (t) => [
    // Spec constraints from data-model.md §8.4.
    check(
      "invoices_number_required_unless_draft_or_void",
      sql`${t.state} IN ('draft', 'void') OR ${t.number} IS NOT NULL`,
    ),
    check(
      "invoices_filed_ref_state_match",
      sql`${t.filedRef} IS NULL OR ${t.state} IN ('filed', 'sent')`,
    ),
    // Invoice numbers unique per entity. Partial — drafts and voids can
    // legitimately share NULL.
    unique("invoices_entity_number_uniq").on(t.entityId, t.number),
    index("invoices_entity_issue_date_idx").on(t.entityId, t.issueDate.desc()),
    index("invoices_entity_state_idx").on(t.entityId, t.state),
    index("invoices_client_idx").on(t.clientId),
    index("invoices_mirror_idx")
      .on(t.mirrorInvoiceId)
      .where(sql`${t.mirrorInvoiceId} IS NOT NULL`),
    // The "owed to me" filter — sent but not paid.
    index("invoices_unpaid_idx")
      .on(t.entityId, t.dueDate)
      .where(sql`${t.paidAt} IS NULL AND ${t.state} = 'sent'`),
  ],
);

export const invoiceVersions = pgTable(
  "invoice_versions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    versionNum: integer("version_num").notNull(),
    stateSnapshot: jsonb("state_snapshot").notNull(),
    diff: jsonb("diff")
      .notNull()
      .default(sql`'[]'::jsonb`),
    semanticSummary: text("semantic_summary"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: actorKindEnum("actor_kind").notNull(),
    agentId: text("agent_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoice_versions_monotonic").on(t.invoiceId, t.versionNum),
    index("invoice_versions_invoice_ver_idx").on(t.invoiceId, t.versionNum.desc()),
    index("invoice_versions_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Atomic per-(entity, year) sequence for assigning invoice numbers.
 *
 * Postgres SEQUENCEs are global and don't reset per scope; rather than
 * spawn one sequence per entity-year we keep a small counter row and
 * `SELECT … FOR UPDATE` it inside the same transaction that inserts the
 * invoice. Resolves the rare-but-possible race where two concurrent
 * invoice creations would compute the same `MAX(seq) + 1`.
 *
 * Composite PK so the row is upserted naturally on first use of a new
 * year. Manual override (caller supplies an explicit `number`) bypasses
 * the counter — see `assignInvoiceNumber` in the domain layer.
 */
export const entityInvoiceCounters = pgTable(
  "entity_invoice_counters",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    nextSeq: integer("next_seq").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.year] })],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceVersion = typeof invoiceVersions.$inferSelect;
export type EntityInvoiceCounter = typeof entityInvoiceCounters.$inferSelect;
