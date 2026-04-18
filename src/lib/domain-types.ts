/**
 * Shared TypeScript aliases for enum values used across domain code.
 * Drizzle's `pgEnum` returns its own column type; these string-literal
 * aliases let services and helpers type values without importing
 * `drizzle-orm/pg-core` everywhere.
 *
 * Keep in sync with `src/db/schema/enums.ts`.
 */

export type ActorKind = "user" | "system";

export type ThingType =
  | "invoice"
  | "expense"
  | "receipt"
  | "vat_declaration"
  | "annual_report"
  | "income_tax_return"
  | "balance_sheet"
  | "budget"
  | "trip"
  | "trip_report"
  | "payroll_run"
  | "scenario"
  | "billing_arrangement";
