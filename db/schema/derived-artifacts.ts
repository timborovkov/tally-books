/**
 * Derived artifacts — Things whose state is computed from source data.
 *
 * The recalc worker (§6.5 of the project brief) maintains these. Every
 * derived artifact:
 *
 *   - Is versioned (uses `versionedColumns()` + a `_versions` companion).
 *   - Has a `computedSnapshot` jsonb that holds the full computed state
 *     in a domain-specific shape. This is what the UI renders and what the
 *     filing flow submits.
 *   - Respects the editor-safety rules: filed/locked/edit-session/period-lock
 *     all block auto-refresh.
 *
 * Trips and meetings live here too, even though they're partly source data,
 * because the trip_report on top of them is fully derived and the trip
 * itself is a versioned Thing.
 */

import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { versionedColumns, versionTable } from './_versioning';
import { entities, financialPeriods, persons } from './entities-and-jurisdictions';

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

/** Where a balance sheet entry sits on the sheet. */
export const balanceSheetEntryKindEnum = pgEnum('balance_sheet_entry_kind', [
  'asset',
  'liability',
  'equity',
]);

/**
 * The kind of payout in a payroll run. Different jurisdictions have
 * different sets; the union here is the superset across EE/FI/US-DE.
 * Adding a new jurisdiction may add new values.
 */
export const payoutKindEnum = pgEnum('payout_kind', [
  'salary',
  'dividend',
  'board_compensation',
  'yksittaisotto', // FI toiminimi private withdrawal
  'reimbursement',
  'other',
]);

/* -------------------------------------------------------------------------- */
/*  VAT declarations                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One declaration per (entity, period). Period must be a `month` or
 * `quarter` financial_period, depending on jurisdiction rules.
 *
 * `computedSnapshot` shape per jurisdiction (see jurisdiction config),
 * roughly:
 *   {
 *     totalSales, totalSalesVat,
 *     totalEUSales, ...,
 *     totalPurchases, totalPurchasesVat,
 *     deductibleVat,
 *     payable | refundable,
 *     lineItems: [...]
 *   }
 */
export const vatDeclarations = pgTable('vat_declarations', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  periodId: text('period_id')
    .notNull()
    .references(() => financialPeriods.id),
  computedSnapshot: jsonb('computed_snapshot').notNull(),
  ...versionedColumns(),
});

export const vatDeclarationVersions = versionTable(
  'vat_declaration_versions',
  'vat_declaration_id'
);

/* -------------------------------------------------------------------------- */
/*  Annual reports                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Required by law for legal entities (e.g. Estonian OÜ annual report).
 * Includes balance sheet, income statement, and notes — all rolled into
 * `computedSnapshot`.
 *
 * We always show a disclaimer banner reminding the user that the user (or
 * their accountant) is responsible for the legal sign-off. Tally generates
 * the draft.
 */
export const annualReports = pgTable('annual_reports', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  /** Financial year identifier — entity's `financialYearStartMonth` defines start. */
  financialYear: integer('financial_year').notNull(),
  computedSnapshot: jsonb('computed_snapshot').notNull(),
  ...versionedColumns(),
});

export const annualReportVersions = versionTable(
  'annual_report_versions',
  'annual_report_id'
);

/* -------------------------------------------------------------------------- */
/*  Personal income tax returns                                               */
/* -------------------------------------------------------------------------- */

/**
 * Personal income tax preparation. `subjectPersonId` is the person whose
 * return this is — usually the user, but could be a spouse if modelled.
 *
 * `jurisdictionId` indicates which tax authority this is for. The same
 * person may have returns in multiple jurisdictions in the same year.
 */
export const incomeTaxReturns = pgTable('income_tax_returns', {
  id: text('id').primaryKey(),
  subjectPersonId: text('subject_person_id')
    .notNull()
    .references(() => persons.id),
  jurisdictionId: text('jurisdiction_id').notNull(),
  taxYear: integer('tax_year').notNull(),
  computedSnapshot: jsonb('computed_snapshot').notNull(),
  ...versionedColumns(),
});

export const incomeTaxReturnVersions = versionTable(
  'income_tax_return_versions',
  'income_tax_return_id'
);

/* -------------------------------------------------------------------------- */
/*  Balance sheets                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A balance sheet for an entity at a point in time. The personal pseudo-
 * entity also has balance sheets — these are informational only and do
 * not feed into legal filings, but they DO inform tax estimates in
 * wealth-tax jurisdictions.
 */
export const balanceSheets = pgTable('balance_sheets', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  snapshot: jsonb('snapshot').notNull(),
  ...versionedColumns(),
});

export const balanceSheetVersions = versionTable(
  'balance_sheet_versions',
  'balance_sheet_id'
);

/**
 * Manually-entered items that augment a computed balance sheet — investments,
 * loans receivable, large upcoming expenses. Sourced from user input rather
 * than book-derived (which is what makes them needed in the first place).
 */
export const balanceSheetEntries = pgTable('balance_sheet_entries', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  kind: balanceSheetEntryKindEnum('kind').notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Budgets                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A budget for a period and a scope (entity or personal).
 *
 * IMPORTANT: budget-vs-reality comparisons must use the budget version
 * that was active during the period, not the current version. The budget
 * version timeline makes this possible — the comparison query reads
 * `<budget>_versions` and finds the one whose `createdAt` falls before
 * (or at the start of) the comparison window.
 */
export const budgets = pgTable('budgets', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  periodId: text('period_id')
    .notNull()
    .references(() => financialPeriods.id),
  /** Array of { categoryId, plannedAmount, currency, notes } objects. */
  lines: jsonb('lines').notNull().default([]),
  ...versionedColumns(),
});

export const budgetVersions = versionTable('budget_versions', 'budget_id');

/* -------------------------------------------------------------------------- */
/*  Trips & meetings                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A trip the user took. Multi-country support: `destinations` is an array
 * of `{ country, fromDate, toDate, days }` segments. Per diem calculation
 * in the trip report walks this array against the jurisdiction's per
 * diem rules.
 *
 * `narrative` is the business-justification text — important for the
 * "I was working in Vietnam for a month" case.
 *
 * Trips are versioned because the user often refines them after the fact
 * (correcting dates, adding meetings, expanding the narrative).
 */
export const trips = pgTable('trips', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  personId: text('person_id')
    .notNull()
    .references(() => persons.id),
  destinations: jsonb('destinations').notNull().default([]),
  purpose: text('purpose'),
  narrative: text('narrative'),
  ...versionedColumns(),
});

export const tripVersions = versionTable('trip_versions', 'trip_id');

/**
 * Derived from a trip + its linked expenses + jurisdiction per-diem rules.
 */
export const tripReports = pgTable('trip_reports', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id),
  computedSnapshot: jsonb('computed_snapshot').notNull(),
  ...versionedColumns(),
});

export const tripReportVersions = versionTable(
  'trip_report_versions',
  'trip_report_id'
);

/**
 * Business meetings — used to justify expenses (meals, travel, gifts).
 * Not versioned: meetings are fact-shaped, edits are rare and don't need
 * full history. They DO show up in audit_log.
 */
export const meetings = pgTable('meetings', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  location: text('location'),
  /** [{ name, role, partyId? }, ...] */
  counterparties: jsonb('counterparties').notNull().default([]),
  purpose: text('purpose'),
  notes: text('notes'),
  /** Expenses incurred at or for this meeting. */
  expenseIds: jsonb('expense_ids').notNull().default([]),
  /** If part of a trip. */
  tripId: text('trip_id').references(() => trips.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Payroll runs                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A single payout to a person from an entity. The "calculate paychecks"
 * feature creates these as drafts, the user reviews and confirms, and
 * the books update on transition to `sent`/`filed` (which here means
 * "paid + reported").
 *
 * `taxes` carries the per-jurisdiction breakdown of withholdings, social
 * security, employer contributions, etc. — shape per jurisdiction config.
 */
export const payrollRuns = pgTable('payroll_runs', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  personId: text('person_id')
    .notNull()
    .references(() => persons.id),
  periodId: text('period_id')
    .notNull()
    .references(() => financialPeriods.id),
  payoutKind: payoutKindEnum('payout_kind').notNull(),

  gross: numeric('gross', { precision: 20, scale: 4 }).notNull(),
  net: numeric('net', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  taxes: jsonb('taxes').notNull().default({}),

  /** Optional reference to the bank transaction that paid this out. */
  paidViaTransactionId: text('paid_via_transaction_id'),

  ...versionedColumns(),
});

export const payrollRunVersions = versionTable(
  'payroll_run_versions',
  'payroll_run_id'
);

/* -------------------------------------------------------------------------- */
/*  Scenarios — what-if modelling                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pure modelling. Scenarios NEVER write to real artifacts — they read the
 * current state as a base and apply hypothetical changes, then store the
 * computed result.
 *
 * `base` is either `'current'` (snapshot of live data at run time) or
 * another scenario's id (chained scenarios).
 *
 * `changes` describes the hypothetical: residency change, jurisdiction
 * change, expense reclassification, income restructuring. Shape is a
 * discriminated union — see `ScenarioChange` in the sibling types file.
 */
export const scenarios = pgTable('scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  base: text('base').notNull().default('current'),
  changes: jsonb('changes').notNull().default([]),
  computed: jsonb('computed'),
  ...versionedColumns(),
});

export const scenarioVersions = versionTable('scenario_versions', 'scenario_id');

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type BalanceSheetEntryKind =
  (typeof balanceSheetEntryKindEnum.enumValues)[number];
export type PayoutKind = (typeof payoutKindEnum.enumValues)[number];

export type VatDeclaration = typeof vatDeclarations.$inferSelect;
export type NewVatDeclaration = typeof vatDeclarations.$inferInsert;

export type AnnualReport = typeof annualReports.$inferSelect;
export type NewAnnualReport = typeof annualReports.$inferInsert;

export type IncomeTaxReturn = typeof incomeTaxReturns.$inferSelect;
export type NewIncomeTaxReturn = typeof incomeTaxReturns.$inferInsert;

export type BalanceSheet = typeof balanceSheets.$inferSelect;
export type NewBalanceSheet = typeof balanceSheets.$inferInsert;
export type BalanceSheetEntry = typeof balanceSheetEntries.$inferSelect;
export type NewBalanceSheetEntry = typeof balanceSheetEntries.$inferInsert;

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

export type TripReport = typeof tripReports.$inferSelect;
export type NewTripReport = typeof tripReports.$inferInsert;

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;

export type Scenario = typeof scenarios.$inferSelect;
export type NewScenario = typeof scenarios.$inferInsert;
