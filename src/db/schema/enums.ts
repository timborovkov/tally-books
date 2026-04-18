import { pgEnum } from "drizzle-orm/pg-core";

// Lifecycle every versioned Thing rides through. data-structure.md §2.1.
export const thingStateEnum = pgEnum("thing_state", [
  "draft",
  "ready",
  "sent",
  "filed",
  "amending",
  "void",
]);

// Who produced a version row. data-structure.md §2.2.
// Agents ride on `'user'` with `agent_id` set on the version row.
export const actorKindEnum = pgEnum("actor_kind", ["user", "system"]);

// Names every versioned or lockable Thing. data-structure.md §2.3.
// Used by edit_sessions, audit_log, agent_suggestions.
export const thingTypeEnum = pgEnum("thing_type", [
  "invoice",
  "expense",
  "receipt",
  "vat_declaration",
  "annual_report",
  "income_tax_return",
  "balance_sheet",
  "budget",
  "trip",
  "trip_report",
  "commute_mileage_claim",
  "employer_benefit_enrollment",
  "compliance_task",
  "payroll_run",
  "scenario",
  "billing_arrangement",
]);

// data-structure.md §4.1.
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

// data-structure.md §4.4.
export const resourceTypeEnum = pgEnum("resource_type", [
  "invoices",
  "expenses",
  "receipts",
  "payouts",
  "taxes",
  "filings",
  "legal_documents",
  "estimates",
  "budgets",
  "reports",
  "trips",
  "benefits",
  "travel_compensation",
  "compliance_tasks",
  "agents",
  "business_details",
  "personal_details",
]);

// data-structure.md §4.4.
export const accessLevelEnum = pgEnum("access_level", ["read", "write"]);

// data-structure.md §5.2. The "personal" pseudo-entity rides on this enum;
// it's a real row, not a magic ID, so queries that join through entities
// don't need a special case.
export const entityKindEnum = pgEnum("entity_kind", ["legal", "personal"]);

// data-structure.md §5.5.
export const periodKindEnum = pgEnum("period_kind", ["month", "quarter", "year", "custom"]);
