import { z } from "zod";

/**
 * JurisdictionConfig — the typed shape of `jurisdictions.config` jsonb.
 *
 * docs/data-model.md §5.1 lists the fields a jurisdiction bundles up:
 * entity types, tax types, VAT rules, per-diem, filing schedules, portal
 * and guide links, payout options, social-security contributions, and a
 * payout-kind display map.
 *
 * v0.1 keeps each subtype intentionally shallow — strings + simple
 * objects — because the consumers don't exist yet. We deepen each
 * shape in the PR that consumes it (VAT calc in v0.3, payroll in v0.6)
 * so the types follow real usage instead of guessing.
 *
 * The DB stores this as `jsonb`; the service layer parses every read
 * via `parseJurisdictionConfig` and every write goes through this
 * schema, so no malformed config ever lands.
 */

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  // Free-form note — e.g. "EMTA portal", "VAT registration".
  note: z.string().optional(),
});

const vatRateSchema = z.object({
  // Stable identifier the rest of the app keys off (e.g. "standard",
  // "reduced", "zero"). Lowercase, snake_case.
  id: z.string().min(1),
  label: z.string().min(1),
  // Stored as a decimal fraction (0.22 = 22 %), not a percent. Keeps
  // the VAT calc trivial and matches how rates show up in source data.
  rate: z.number().min(0).max(1),
});

const filingScheduleSchema = z.object({
  // The Thing this schedule covers. Loosely typed in v0.1 — the recalc
  // worker doesn't exist yet. Examples: "vat_declaration",
  // "annual_report", "income_tax_return".
  thing: z.string().min(1),
  cadence: z.enum(["monthly", "quarterly", "yearly", "on_demand"]),
  // Free-form description of when within the cadence it's due.
  // E.g. "20th of the month after the period".
  dueRule: z.string().min(1),
});

const payoutOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Which entity types this payout is available for; empty = all.
  forEntityTypes: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const contributionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Optional default rate; jurisdictions like FI YEL have variable
  // rates that depend on income brackets, so this is just a hint.
  defaultRate: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

// Obligation catalogs — the compliance evaluator (brief §5.4.2,
// docs/data-model.md §9.8) diffs these against entity/employment state
// to surface compliance tasks. They're defined alongside the
// evaluator itself in v0.6 (employment) and v0.7 (tax/payment/
// reporting) — no v0.1 stub needed; Zod schemas extend cheaply and
// existing jurisdiction rows without the field parse fine once the
// new optional keys land.

// Default chart-of-accounts categories shipped with the jurisdiction.
// Auto-applied as entity-scoped rows when a new entity is created in
// the jurisdiction, so day-one users have somewhere to put their first
// expense without hand-building a CoA. Only `kind='expense'` defaults
// ship in v0.1 — invoice line items don't carry `categoryId` (revenue
// is computed from `invoices.total`) and there's no GL/balance-sheet
// code yet, so non-expense kinds would be dead rows. The enum stays
// open here in case a later jurisdiction (or v0.3 GL work) wants to
// pre-seed asset/liability/equity defaults.
const defaultCategorySchema = z.object({
  // Stable slug used as a metadata marker on the inserted row. Lets the
  // seeder skip rows already present (idempotency) and gives a future
  // "reset to defaults" UX a stable key to match on. Lowercase
  // snake_case.
  key: z.string().min(1),
  kind: z.enum(["income", "expense", "asset", "liability", "equity"]),
  name: z.string().min(1),
  // Optional account code (e.g. "5100"). Lined up with conventional
  // CoA numbering when the jurisdiction has one.
  code: z.string().optional(),
  // Points at another default's `key` for hierarchical nesting. The
  // seeder topo-sorts so parents always insert before children.
  parentKey: z.string().optional(),
});

export const jurisdictionConfigSchema = z.object({
  // Currency the entities of this jurisdiction default to. Entities
  // can override (an Estonian OÜ that books in USD is unusual but
  // legal), so this is a hint, not a constraint.
  defaultCurrency: z.string().length(3),
  // Entity-type identifiers the jurisdiction recognises (e.g. "OU",
  // "AS", "TOIMINIMI"). The entity-creation form filters by this list.
  entityTypes: z.array(z.string().min(1)).min(1),
  // Tax-type identifiers (e.g. "vat", "corporate_income",
  // "personal_income", "social_tax", "yel"). Free-form in v0.1.
  taxTypes: z.array(z.string().min(1)).default([]),
  vatRules: z
    .object({
      registrationRequired: z.boolean(),
      // Threshold in the jurisdiction's default currency above which
      // registration is mandatory; null = no threshold (always required
      // or never).
      registrationThreshold: z.number().nullable(),
      rates: z.array(vatRateSchema),
    })
    .nullable(),
  perDiemRules: z
    .object({
      // Domestic per-diem rate in the jurisdiction's default currency.
      domestic: z.number().nullable(),
      // Foreign per-diem is per-country and lives outside this v0.1
      // shape; v0.6 (trips) wires it up properly. We keep the field
      // here as a placeholder so consumers can detect "not modelled
      // yet" without the schema changing later.
      foreignSource: z.string().optional(),
    })
    .nullable(),
  filingSchedules: z.array(filingScheduleSchema).default([]),
  portalLinks: z.array(linkSchema).default([]),
  guideLinks: z.array(linkSchema).default([]),
  payoutOptions: z.array(payoutOptionSchema).default([]),
  contributions: z.array(contributionSchema).default([]),
  // Maps a payout kind id → user-facing label per jurisdiction. Lets
  // a Finnish toiminimi show "Yksittäisotto" while an Estonian OÜ
  // shows "Dividend" for the same conceptual payout slot.
  payoutKindDisplay: z.record(z.string(), z.string()).default({}),
  defaultCategories: z.array(defaultCategorySchema).default([]),
});

export type DefaultCategory = z.infer<typeof defaultCategorySchema>;

export type JurisdictionConfig = z.infer<typeof jurisdictionConfigSchema>;

/**
 * Parse a `jurisdictions.config` jsonb value. Throws ZodError on
 * malformed input — callers in the service layer wrap this in a
 * typed error so the UI gets a useful message.
 */
export function parseJurisdictionConfig(value: unknown): JurisdictionConfig {
  return jurisdictionConfigSchema.parse(value);
}
