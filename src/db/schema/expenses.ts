import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { categories } from "./categories";
import { entities } from "./entities";
import { actorKindEnum, expensePaidByEnum, reimbursementStatusEnum } from "./enums";
import { receipts } from "./receipts";
import { users } from "./users";
import { versionedColumns } from "./versioning";

/**
 * Versioned accounting fact — the second versioned Thing after receipts.
 * docs/data-model.md §8.3.
 *
 * Includes the full data-model schema (VAT fields, base-currency
 * conversion, lazy FKs to bank-tx and trip) so the table doesn't churn
 * when those verticals land. The recalc/FX worker that fills
 * `amount_in_base` and the bank-tx/trip linker UIs are out of scope for
 * this PR — those columns sit NULL until their owning feature ships.
 *
 * `current_version_id` is hand-wired DEFERRABLE in the migration for
 * the same reason as receipts (drizzle-kit can't emit DEFERRABLE).
 *
 * `linkedTransactionId` and `tripId` are stored as plain text columns
 * with no FK because `bank_transactions` and `trips` don't exist yet.
 * When those tables ship, the FK is added in a follow-up migration —
 * the columns are documented as future FKs in the comment so the
 * upgrade is mechanical.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "restrict" }),
    vendor: text("vendor"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
    currency: text("currency").notNull(),
    // Populated by the FX recalc worker (v0.3). NULL until then.
    amountInBase: numeric("amount_in_base", { precision: 20, scale: 4 }),
    vatAmount: numeric("vat_amount", { precision: 20, scale: 4 }),
    vatRate: numeric("vat_rate", { precision: 6, scale: 4 }),
    vatDeductible: boolean("vat_deductible").notNull().default(true),
    paidBy: expensePaidByEnum("paid_by").notNull().default("entity"),
    // Always non-null; defaults to `not_applicable` for paid_by != personal_reimbursable.
    // The domain layer (markReimbursed, createExpense) keeps this in
    // sync with paid_by; the DB-level invariant is enforced in code, not
    // a CHECK, because future workflows may briefly hold an in-progress
    // status while changing paid_by.
    reimbursementStatus: reimbursementStatusEnum("reimbursement_status")
      .notNull()
      .default("not_applicable"),
    linkedReceiptId: text("linked_receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    // Lazy FK — bank_transactions table doesn't exist yet. Documented as
    // a future FK so the follow-up migration is one ALTER TABLE.
    linkedTransactionId: text("linked_transaction_id"),
    // Lazy FK — trips table doesn't exist yet (v0.6).
    tripId: text("trip_id"),
    description: text("description"),
    // Hand-wired DEFERRABLE FK in migration SQL. See receipts.ts.
    currentVersionId: text("current_version_id"),
    ...versionedColumns(),
  },
  (t) => [
    index("expenses_entity_occurred_idx").on(t.entityId, t.occurredAt.desc()),
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_linked_receipt_idx").on(t.linkedReceiptId),
    index("expenses_trip_idx").on(t.tripId),
    // Drives the "owed to me" filter — picking up open reimbursements.
    index("expenses_reimbursement_idx")
      .on(t.paidBy, t.reimbursementStatus)
      .where(sql`${t.reimbursementStatus} <> 'not_applicable'`),
    index("expenses_state_active_idx")
      .on(t.state)
      .where(sql`${t.state} <> 'void'`),
  ],
);

export const expenseVersions = pgTable(
  "expense_versions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
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
    unique("expense_versions_monotonic").on(t.expenseId, t.versionNum),
    index("expense_versions_expense_ver_idx").on(t.expenseId, t.versionNum.desc()),
    index("expense_versions_created_at_idx").on(t.createdAt),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseVersion = typeof expenseVersions.$inferSelect;
