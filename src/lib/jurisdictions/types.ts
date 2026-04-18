import { z } from "zod";

/**
 * JurisdictionConfig — the typed shape of `jurisdictions.config` jsonb.
 *
 * data-structure.md §5.1 lists the fields a jurisdiction bundles up:
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

// Obligation catalog entry — the compliance evaluator (brief §5.4.2,
// data-structure.md §9.8) diffs these catalogs against entity/
// employment state to surface compliance tasks. v0.1 reserves the
// shape with empty arrays; seeds land in v0.6/v0.7.
const obligationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Optional evaluator hints — free-form until the compliance engine
  // lands and we know what it needs. Keeping this loose now avoids
  // forcing a schema migration every time the evaluator learns
  // something new.
  evaluatorHints: z.record(z.string(), z.unknown()).optional(),
  guideLinks: z.array(linkSchema).default([]),
});

const obligationsCatalogSchema = z.object({
  employment: z.array(obligationSchema).default([]),
  taxPayment: z.array(obligationSchema).default([]),
  reporting: z.array(obligationSchema).default([]),
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
  // Obligation catalogs, keyed by domain. v0.1 reserves the shape;
  // seeds arrive in v0.6 (employment obligations) and v0.7 (tax-payment
  // and reporting obligations) once the compliance evaluator lands.
  // Defaulting to empty arrays lets existing seeds parse cleanly.
  obligations: obligationsCatalogSchema.default({ employment: [], taxPayment: [], reporting: [] }),
});

export type JurisdictionConfig = z.infer<typeof jurisdictionConfigSchema>;

/**
 * Parse a `jurisdictions.config` jsonb value. Throws ZodError on
 * malformed input — callers in the service layer wrap this in a
 * typed error so the UI gets a useful message.
 */
export function parseJurisdictionConfig(value: unknown): JurisdictionConfig {
  return jurisdictionConfigSchema.parse(value);
}
