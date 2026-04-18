/**
 * Billing arrangements (project brief §5.1.6.1).
 *
 * A billing arrangement describes the deal between a billing entity and a
 * counterparty. It drives invoice draft generation, estimation, and
 * dashboard reminders.
 *
 * Modeling reality is the hard part. Real deals have side letters, ramp-up
 * periods, mid-year renegotiations, performance bonuses, and dozens of
 * other quirks. We don't try to model all of it. Instead:
 *
 *   1. The structured `model` covers common shapes: lump_sum, hourly,
 *      daily, monthly, percent_of_underlying. These are enough to drive
 *      invoice draft generation in ~80% of cases.
 *
 *   2. The `explainerMd` field carries the human description of the deal
 *      — its quirks, its history, its terms. The agent reads this when
 *      asked to reason about the arrangement.
 *
 *   3. `attachedDocuments` (via the join table) link to contracts and
 *      side letters in the document store. The agent can RAG over them.
 *
 *   4. `isEstimate` is the safety valve: when set, the structured model
 *      is acknowledged to be a rough proxy. The UI shows a clear label,
 *      and consumers (forecasting, budget vs reality) can choose to
 *      treat estimate-flagged arrangements differently.
 *
 * The author's "Tecci" arrangement is one instance: hourly model at
 * ~50 €/h, marked as estimate, with the actual contract attached and the
 * complex billing logic described in the explainer.
 */

import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { versionedColumns, versionTable } from './_versioning';
import { entities } from './entities-and-jurisdictions';
import { parties } from './source-artifacts';
import { documents } from './documents';

export const billingArrangements = pgTable('billing_arrangements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  billingEntityId: text('billing_entity_id')
    .notNull()
    .references(() => entities.id),
  counterpartyClientId: text('counterparty_client_id').references(() => parties.id),

  /** Free-form description of the deal — the source of truth for the human. */
  explainerMd: text('explainer_md'),

  /**
   * The structured calculation model. Discriminated union; see
   * `BillingArrangementModel` in the sibling types file. Examples:
   *   { kind: 'lump_sum', amount, currency, dates }
   *   { kind: 'hourly', rate, currency, hoursSource }
   *   { kind: 'daily', rate, currency, daysSource }
   *   { kind: 'monthly', amount, currency }
   *   { kind: 'percent_of_underlying', pct, underlying: { kind, ref } }
   */
  model: jsonb('model').notNull(),

  /** Cadence: cron-like or named schedule. Used by draft generator. */
  schedule: jsonb('schedule').notNull().default({}),

  /** Default VAT treatment; can be overridden per generated invoice. */
  vatTreatment: jsonb('vat_treatment').notNull().default({}),
  taxNotesMd: text('tax_notes_md'),

  /** Payment terms, late fees, currency, FX handling, etc. */
  terms: jsonb('terms').notNull().default({}),

  /**
   * When true, the structured model is a deliberate proxy for a more
   * complex underlying deal. UI labels it clearly; estimators may apply
   * extra uncertainty.
   */
  isEstimate: boolean('is_estimate').notNull().default(false),

  activeFrom: timestamp('active_from', { withTimezone: true }),
  activeTo: timestamp('active_to', { withTimezone: true }),

  ...versionedColumns(),
});

export const billingArrangementVersions = versionTable(
  'billing_arrangement_versions',
  'billing_arrangement_id'
);

/**
 * Many-to-many link to documents (contracts, side letters, term-confirming
 * emails). The same document can be attached to multiple arrangements.
 *
 * `role` is a free-form classifier so the UI can distinguish the primary
 * contract from side-letters and amendments.
 */
export const billingArrangementDocuments = pgTable('billing_arrangement_documents', {
  id: text('id').primaryKey(),
  arrangementId: text('arrangement_id')
    .notNull()
    .references(() => billingArrangements.id),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id),
  role: text('role').notNull().default('contract'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BillingArrangement = typeof billingArrangements.$inferSelect;
export type NewBillingArrangement = typeof billingArrangements.$inferInsert;

export type BillingArrangementDocument =
  typeof billingArrangementDocuments.$inferSelect;
export type NewBillingArrangementDocument =
  typeof billingArrangementDocuments.$inferInsert;
