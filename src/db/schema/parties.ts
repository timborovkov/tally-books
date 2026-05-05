import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { partyKindEnum } from "./enums";

/**
 * Counterparties — clients we bill, suppliers we buy from, contractors
 * we engage, employees on payroll. docs/data-model.md §8.1.
 *
 * One row per real-world counterparty across all four kinds. Switching a
 * row between kinds is a normal kind update; it preserves links from
 * invoices, expenses, time entries, etc. that already point at the row.
 *
 * Not versioned — counterparty contact info is config-style (current view
 * is what matters; the audit trail in `audit_log` carries the change
 * history). Soft-delete via `archived_at` because invoices, expenses,
 * and time entries FK at this row and a hard delete would orphan
 * accounting history.
 *
 * `legal_entity_id` carries the counterparty's business / VAT / EIN id
 * when they're a legal person — used by the internal-invoice mirror flow
 * to find an existing party row that represents another tally entity
 * before creating a new one.
 */
export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    kind: partyKindEnum("kind").notNull(),
    name: text("name").notNull(),
    legalEntityId: text("legal_entity_id"),
    contact: jsonb("contact")
      .notNull()
      .default(sql`'{}'::jsonb`),
    taxIds: jsonb("tax_ids")
      .notNull()
      .default(sql`'{}'::jsonb`),
    defaultTerms: jsonb("default_terms")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("parties_kind_active_idx")
      .on(t.kind, t.archivedAt)
      .where(sql`${t.archivedAt} IS NULL`),
    index("parties_name_idx").on(t.name),
    // Resolve a legal entity to its party row (internal-invoice mirror,
    // dedupe at intake time). Partial because most counterparties are
    // individuals with no legal_entity_id and we don't want them in the
    // index.
    index("parties_legal_entity_idx")
      .on(t.legalEntityId)
      .where(sql`${t.legalEntityId} IS NOT NULL`),
  ],
);

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
