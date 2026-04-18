/**
 * Source artifacts — the records the user enters directly. Everything else
 * (declarations, reports, balance sheets, statements) is computed from these.
 *
 * Each source artifact follows the versioning pattern: a current-state table
 * (`expenses`, `invoices`, …) plus a companion `_versions` table built with
 * `versionTable()`.
 *
 * Domain events are emitted from mutations on these tables. The recalc
 * worker subscribes and rebuilds derived artifacts that depend on them
 * (see `src/lib/events/dependencies.ts` and the project brief §6.5).
 */

import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { versionedColumns, versionTable } from './_versioning';
import { entities } from './entities-and-jurisdictions';
import { blobs } from './blobs';
import { categories } from './taxonomies';

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Who fronted the money for this expense. `personal_reimbursable` means the
 * user paid with a personal card on behalf of an entity and expects to be
 * reimbursed — the books record both the expense and the reimbursement
 * obligation.
 */
export const expensePaidByEnum = pgEnum('expense_paid_by', [
  'entity',
  'personal_reimbursable',
  'personal_no_reimburse',
]);

export const receiptOcrStatusEnum = pgEnum('receipt_ocr_status', [
  'pending', // queued, not yet processed
  'processing', // worker has it
  'done',
  'failed',
  'skipped', // e.g. user uploaded a non-receipt document
]);

export const invoiceDeliveryMethodEnum = pgEnum('invoice_delivery_method', [
  'e_invoice', // Finnish e-invoice or similar
  'pdf', // user emails the PDF themselves
  'email', // app sends the PDF via email
  'manual', // recorded but delivered out-of-band
]);

export const partyKindEnum = pgEnum('party_kind', [
  'client',
  'supplier',
  'contractor',
  'employee',
]);

export const timeEntrySourceEnum = pgEnum('time_entry_source', [
  'clockify',
  'manual',
]);

/* -------------------------------------------------------------------------- */
/*  Counterparties: clients, suppliers, contractors, employees                */
/* -------------------------------------------------------------------------- */

/**
 * One table for all counterparties, discriminated by `kind`. A single
 * counterparty can play multiple roles over time, but in practice we treat
 * the kind as fairly stable; if it changes we create a new row and link
 * the old one as superseded.
 *
 * `taxIds` mirrors the structure on `persons.ids` for consistency.
 */
export const parties = pgTable('parties', {
  id: text('id').primaryKey(),
  kind: partyKindEnum('kind').notNull(),
  name: text('name').notNull(),
  /** If the counterparty is a legal entity itself: their VAT/business id. */
  legalEntityId: text('legal_entity_id'),
  contact: jsonb('contact').notNull().default({}),
  taxIds: jsonb('tax_ids').notNull().default({}),
  /** Default agreed terms — payment terms, hourly rate, etc. */
  defaultTerms: jsonb('default_terms').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Receipts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A receipt: image or PDF of a purchase, with extracted structured fields.
 * Created by upload (manual or via Paperless-ngx sync). Vision extraction
 * runs in the background.
 *
 * One receipt typically maps to one expense, but the link is on the expense
 * side (`expenses.linkedReceiptId`). A receipt can exist without an
 * expense (just stored for reference).
 *
 * Receipts are versioned because users edit the extracted fields when they
 * disagree with the OCR.
 */
export const receipts = pgTable('receipts', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  blobId: text('blob_id')
    .notNull()
    .references(() => blobs.id),

  /* Extracted fields. All nullable — OCR may not find everything. */
  merchant: text('merchant'),
  /** Date of the purchase, NOT the upload date. */
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  total: numeric('total', { precision: 20, scale: 4 }),
  currency: text('currency'),
  vatAmount: numeric('vat_amount', { precision: 20, scale: 4 }),
  vatRate: numeric('vat_rate', { precision: 6, scale: 4 }),

  ocrStatus: receiptOcrStatusEnum('ocr_status').notNull().default('pending'),
  /** Raw structured response from the vision provider. Useful for audit + debug. */
  ocrRaw: jsonb('ocr_raw'),
  /** Per-field confidence scores, used by UI to highlight low-confidence fields. */
  ocrConfidence: jsonb('ocr_confidence'),

  ...versionedColumns(),
});

export const receiptVersions = versionTable('receipt_versions', 'receipt_id');

/* -------------------------------------------------------------------------- */
/*  Expenses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * An expense: an outflow recognized in the books. May or may not have a
 * receipt attached. May or may not be linked to a bank transaction.
 *
 * `amount` and `vatAmount` are in the original currency; `amountInBase` is
 * the entity's base currency at the FX rate of `occurredAt`. The recalc
 * worker fills `amountInBase` if currency != entity base.
 */
export const expenses = pgTable('expenses', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  categoryId: text('category_id').references(() => categories.id),

  vendor: text('vendor'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

  amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  amountInBase: numeric('amount_in_base', { precision: 20, scale: 4 }),

  vatAmount: numeric('vat_amount', { precision: 20, scale: 4 }),
  vatRate: numeric('vat_rate', { precision: 6, scale: 4 }),
  /**
   * Whether this expense's VAT is deductible for the entity. Defaults true
   * for VAT-registered entities and is overridden per-expense where needed
   * (e.g. employee meals where deduction is partial or disallowed).
   */
  vatDeductible: boolean('vat_deductible').notNull().default(true),

  paidBy: expensePaidByEnum('paid_by').notNull().default('entity'),

  linkedReceiptId: text('linked_receipt_id').references(() => receipts.id),
  linkedTransactionId: text('linked_transaction_id'),
  /** Trips: foreign-key to `trips` lives in derived-artifacts.ts. */
  tripId: text('trip_id'),

  description: text('description'),
  notes: text('notes'),

  ...versionedColumns(),
});

export const expenseVersions = versionTable('expense_versions', 'expense_id');

/* -------------------------------------------------------------------------- */
/*  Invoices                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * An invoice issued by an entity to a counterparty (typically a client, but
 * also used for internal toiminimi → OÜ invoicing).
 *
 * Internal invoices: when sender and recipient are both entities owned by
 * the user, `mirrorInvoiceId` cross-links to the corresponding expense
 * the recipient entity records. The mirror linkage is set up by the
 * "internal invoice" service helper.
 *
 * Line items are stored as JSON because their shape is fluid (some items
 * reference time entries, some reference billing arrangements, some are
 * free-form). The `InvoiceLineItem` type lives in a sibling file.
 */
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  clientId: text('client_id').references(() => parties.id),

  /** Sequential number per entity, with the entity's invoice prefix. */
  number: text('number'),
  issueDate: timestamp('issue_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),

  lineItems: jsonb('line_items').notNull().default([]),

  total: numeric('total', { precision: 20, scale: 4 }),
  vatTotal: numeric('vat_total', { precision: 20, scale: 4 }),
  currency: text('currency').notNull(),
  totalInBase: numeric('total_in_base', { precision: 20, scale: 4 }),

  deliveryMethod: invoiceDeliveryMethodEnum('delivery_method'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),

  /** For internal invoices: id of the mirror invoice on the other entity. */
  mirrorInvoiceId: text('mirror_invoice_id'),

  /** If generated from a billing arrangement, link back. */
  billingArrangementId: text('billing_arrangement_id'),

  notes: text('notes'),

  ...versionedColumns(),
});

export const invoiceVersions = versionTable('invoice_versions', 'invoice_id');

/* -------------------------------------------------------------------------- */
/*  Time entries                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Time entries from Clockify or manual entry. Used by the invoice estimator
 * for hourly billing arrangements (§5.3).
 *
 * Not versioned — they're event-shaped and edited at source (Clockify).
 * If the user manually edits a synced entry, we mark it `manuallyOverridden`
 * and stop syncing changes from the source for that row.
 */
export const timeEntries = pgTable('time_entries', {
  id: text('id').primaryKey(),
  source: timeEntrySourceEnum('source').notNull(),
  /** External ID from the source system, for idempotent sync. */
  externalId: text('external_id'),
  /** Which person logged it. Usually the user. */
  personId: text('person_id'),
  /** Counterparty / client this time was for. */
  partyId: text('party_id').references(() => parties.id),
  project: text('project'),
  description: text('description'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  manuallyOverridden: boolean('manually_overridden').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Bank transactions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Bank transactions imported from bank integrations (Swedbank, Revolut).
 * Bank sync is P3 in the roadmap so this table is sketched, not used yet.
 *
 * Reconciliation: each transaction can be linked to an expense, an invoice
 * (incoming payment), or a payroll run.
 */
export const bankTransactions = pgTable('bank_transactions', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  /** Which account: stored as a free text label per integration for now. */
  accountLabel: text('account_label').notNull(),
  externalId: text('external_id'),

  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  counterparty: text('counterparty'),
  description: text('description'),

  linkedExpenseId: text('linked_expense_id').references(() => expenses.id),
  linkedInvoiceId: text('linked_invoice_id').references(() => invoices.id),
  /** payroll_run lives in derived-artifacts; no FK to avoid cycles. */
  linkedPayrollRunId: text('linked_payroll_run_id'),

  raw: jsonb('raw'),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type ExpensePaidBy = (typeof expensePaidByEnum.enumValues)[number];
export type ReceiptOcrStatus = (typeof receiptOcrStatusEnum.enumValues)[number];
export type InvoiceDeliveryMethod =
  (typeof invoiceDeliveryMethodEnum.enumValues)[number];
export type PartyKind = (typeof partyKindEnum.enumValues)[number];
export type TimeEntrySource = (typeof timeEntrySourceEnum.enumValues)[number];

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type ReceiptVersion = typeof receiptVersions.$inferSelect;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseVersion = typeof expenseVersions.$inferSelect;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceVersion = typeof invoiceVersions.$inferSelect;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;
