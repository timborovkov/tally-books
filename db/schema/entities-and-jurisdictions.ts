/**
 * Entities, jurisdictions, persons, and financial periods.
 *
 * The conceptual model:
 *
 *   - A `jurisdiction` is a country-level config bundle (Estonia, Finland,
 *     Delaware US). It carries everything jurisdiction-specific: entity
 *     types available, tax types, VAT rules, per diem rules, filing
 *     schedules, portal links, payout options, mandatory contributions.
 *
 *   - An `entity` is a real legal entity (or the special "personal"
 *     pseudo-entity, represented by a row with `kind = 'personal'`).
 *
 *   - A `person` represents a human — board members, the user themselves,
 *     external contractors, etc. Linked to entities via `entity_person_links`.
 *
 *   - A `financial_period` is a window (month, quarter, year) that can be
 *     locked. Locking rejects mutations to all Things in that window.
 *
 * Everything in the system associates with an entity (which may be the
 * personal pseudo-entity).
 */

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users-and-iam';

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

export const entityKindEnum = pgEnum('entity_kind', ['legal', 'personal']);

export const periodKindEnum = pgEnum('period_kind', [
  'month',
  'quarter',
  'year',
  'custom',
]);

/* -------------------------------------------------------------------------- */
/*  Jurisdictions                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Ships prefilled for `EE`, `FI`, `US-DE`. The big `config` blob is what
 * makes Tally jurisdiction-agnostic — see `packages/jurisdictions/` for
 * the typed schemas.
 *
 * The `freeformContextMd` field is what gets injected into AI agent
 * prompts: extra context, quirks, gotchas the user wants the agent to
 * know about this jurisdiction.
 */
export const jurisdictions = pgTable('jurisdictions', {
  id: text('id').primaryKey(),
  /** ISO-style code: `EE`, `FI`, `US-DE`, `ES`, `PT`, … */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /**
   * The big bundle. See `JurisdictionConfig` type in
   * `packages/jurisdictions/types.ts`. Contains: entity_types[],
   * tax_types[], vat_rules, per_diem_rules, filing_schedules[],
   * portal_links[], guide_links[], payout_options[], contributions[].
   */
  config: jsonb('config').notNull(),
  freeformContextMd: text('freeform_context_md'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Entities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A legal entity (OÜ, toiminimi, LLC, …) OR the special personal
 * pseudo-entity. Most rows in the system reference `entityId`; that
 * column is never nullable, and the personal pseudo-entity gives us a
 * single non-null value to point at for personal finances.
 *
 * The personal entity has `jurisdictionId` set to the user's tax
 * residency jurisdiction; this can change over time and changes there
 * invalidate prior personal tax estimates.
 */
export const entities = pgTable('entities', {
  id: text('id').primaryKey(),
  kind: entityKindEnum('kind').notNull(),
  name: text('name').notNull(),
  /** From the jurisdiction's `entity_types[]` config — e.g. 'OU', 'TOIMINIMI'. */
  entityType: text('entity_type'),
  jurisdictionId: text('jurisdiction_id')
    .notNull()
    .references(() => jurisdictions.id),
  businessId: text('business_id'),
  vatRegistered: boolean('vat_registered').notNull().default(false),
  vatNumber: text('vat_number'),
  address: jsonb('address').notNull().default({}),
  /**
   * Month (1–12) the financial year starts on. For most: 1 (January).
   * Stored as integer for fast filtering.
   */
  financialYearStartMonth: integer('financial_year_start_month').notNull().default(1),
  /** Base currency for this entity. ISO 4217 code. */
  baseCurrency: text('base_currency').notNull().default('EUR'),
  ownership: jsonb('ownership').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Persons                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A person — the user themselves, board members, shareholders, employees,
 * contractors, meeting counterparties.
 *
 * `userId` links to the platform user account if this person is also a
 * Tally user. Most persons won't have one.
 *
 * `ids` carries country-specific identifiers as a JSON object:
 *   { henkilotunnus: '...', isikukood: '...', NIE: '...', SSN: '...' }
 */
export const persons = pgTable('persons', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  legalName: text('legal_name').notNull(),
  /** Currently-assumed tax residency jurisdiction code. */
  taxResidency: text('tax_residency'),
  ids: jsonb('ids').notNull().default({}),
  addresses: jsonb('addresses').notNull().default([]),
  contact: jsonb('contact').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Many-to-many: persons in roles at entities, with a time range.
 * E.g. "Tim was CEO of Foo OÜ from 2022-01-01 to present, with 100% shares."
 */
export const entityPersonLinks = pgTable('entity_person_links', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  personId: text('person_id')
    .notNull()
    .references(() => persons.id),
  /** 'board', 'ceo', 'shareholder', 'cfo', etc. — free-form per jurisdiction. */
  role: text('role').notNull(),
  /** For shareholders. Null for non-equity roles. Stored as percentage 0–100. */
  sharePercent: text('share_percent'),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
});

/* -------------------------------------------------------------------------- */
/*  Financial periods                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A named period for an entity. Periods can be locked, in which case no
 * Thing whose effective date falls within the period can be mutated. The
 * service layer enforces this — there's no DB constraint because Things
 * may straddle entities or have computed effective dates.
 *
 * Unlock requires admin and is logged in `audit_log`.
 */
export const financialPeriods = pgTable('financial_periods', {
  id: text('id').primaryKey(),
  entityId: text('entity_id')
    .notNull()
    .references(() => entities.id),
  kind: periodKindEnum('kind').notNull(),
  /** Display label: "FY2024", "2024-Q3", "2024-03", "Project Mango". */
  label: text('label').notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  locked: boolean('locked').notNull().default(false),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by').references(() => users.id),
  lockReason: text('lock_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type EntityKind = (typeof entityKindEnum.enumValues)[number];
export type PeriodKind = (typeof periodKindEnum.enumValues)[number];

export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

export type EntityPersonLink = typeof entityPersonLinks.$inferSelect;
export type NewEntityPersonLink = typeof entityPersonLinks.$inferInsert;

export type FinancialPeriod = typeof financialPeriods.$inferSelect;
export type NewFinancialPeriod = typeof financialPeriods.$inferInsert;
