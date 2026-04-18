import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

import { entityKindEnum, periodKindEnum } from "./enums";
import { jurisdictions } from "./jurisdictions";
import { persons } from "./persons";
import { users } from "./users";

// data-structure.md §5.2. Every Thing in Tally points at an entity (or
// the personal pseudo-entity, modelled as kind = 'personal'). Ownership
// lives entirely in entity_person_links — there is no `ownership jsonb`
// here; resolved I8 in the spec.
export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    kind: entityKindEnum("kind").notNull(),
    name: text("name").notNull(),
    // Free text drawn from jurisdiction.config.entityTypes (e.g. "OU",
    // "TOIMINIMI"). Nullable for kind='personal' since the personal
    // pseudo-entity has no entity type.
    entityType: text("entity_type"),
    jurisdictionId: text("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id),
    businessId: text("business_id"),
    vatRegistered: boolean("vat_registered").notNull().default(false),
    vatNumber: text("vat_number"),
    address: jsonb("address")
      .notNull()
      .default(sql`'{}'::jsonb`),
    // 1–12. No default — the setup wizard forces a choice.
    financialYearStartMonth: integer("financial_year_start_month").notNull(),
    // ISO 4217. No default — forced at creation. Resolves I15.
    baseCurrency: text("base_currency").notNull(),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("entities_fy_start_month_range", sql`${t.financialYearStartMonth} BETWEEN 1 AND 12`),
    index("entities_jurisdiction_idx").on(t.jurisdictionId),
    index("entities_active_idx")
      .on(t.archivedAt)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

// data-structure.md §5.4. Bitemporal-ish: valid_from / valid_to lets us
// answer "who was on the board on 2024-03-15?" without a separate audit
// table. Setting valid_to closes a link rather than deleting it.
export const entityPersonLinks = pgTable(
  "entity_person_links",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    // numeric(7,4) so a sole shareholder holds exactly 100.0000.
    // numeric(6,4) would cap at 99.9999. Resolves I1.
    // The CHECK below enforces the 0–100 business rule — numeric(7,4)
    // alone would let "200.0000" through (its real ceiling is 999.9999).
    sharePercent: numeric("share_percent", { precision: 7, scale: 4 }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      "entity_person_links_share_percent_range",
      sql`${t.sharePercent} IS NULL OR (${t.sharePercent} >= 0 AND ${t.sharePercent} <= 100)`,
    ),
    index("entity_person_links_entity_idx").on(t.entityId, t.validTo),
    index("entity_person_links_person_idx").on(t.personId, t.validTo),
  ],
);

// data-structure.md §5.5.
export const financialPeriods = pgTable(
  "financial_periods",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    kind: periodKindEnum("kind").notNull(),
    label: text("label").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    locked: boolean("locked").notNull().default(false),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by").references(() => users.id, { onDelete: "set null" }),
    lockReason: text("lock_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("financial_periods_entity_kind_label_uniq").on(t.entityId, t.kind, t.label),
    index("financial_periods_entity_kind_start_idx").on(t.entityId, t.kind, t.startAt),
  ],
);

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type EntityPersonLink = typeof entityPersonLinks.$inferSelect;
export type NewEntityPersonLink = typeof entityPersonLinks.$inferInsert;
export type FinancialPeriod = typeof financialPeriods.$inferSelect;
export type NewFinancialPeriod = typeof financialPeriods.$inferInsert;
