import { pgEnum } from "drizzle-orm/pg-core";

// Lifecycle every versioned Thing rides through. docs/data-model.md §2.1.
export const thingStateEnum = pgEnum("thing_state", [
  "draft",
  "ready",
  "sent",
  "filed",
  "amending",
  "void",
]);

// Who produced a version row. docs/data-model.md §2.2.
// Agents ride on `'user'` with `agent_id` set on the version row.
export const actorKindEnum = pgEnum("actor_kind", ["user", "system"]);

// Names every versioned or lockable Thing. docs/data-model.md §2.3.
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

// docs/data-model.md §4.1.
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

// docs/data-model.md §4.4.
export const resourceTypeEnum = pgEnum("resource_type", [
  "invoices",
  "expenses",
  "receipts",
  "categories",
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

// docs/data-model.md §4.4.
export const accessLevelEnum = pgEnum("access_level", ["read", "write"]);

// docs/data-model.md §5.2. The "personal" pseudo-entity rides on this enum;
// it's a real row, not a magic ID, so queries that join through entities
// don't need a special case.
export const entityKindEnum = pgEnum("entity_kind", ["legal", "personal"]);

// docs/data-model.md §5.5.
export const periodKindEnum = pgEnum("period_kind", ["month", "quarter", "year", "custom"]);

// docs/data-model.md §7.3 — `categories.scope`. `entity` rows are only
// visible inside one entity, `personal` belongs to the personal
// pseudo-entity, `global` is the jurisdiction-default set every entity
// inherits read-only.
export const categoryScopeEnum = pgEnum("category_scope", ["entity", "personal", "global"]);

// docs/data-model.md §7.3 — `categories.kind`. Mirrors the standard
// chart-of-accounts top-level buckets so `code` lines up when an
// entity wires a real CoA later.
export const categoryKindEnum = pgEnum("category_kind", [
  "income",
  "expense",
  "asset",
  "liability",
  "equity",
]);

// docs/data-model.md §8.3 — `expenses.paid_by`. Drives the reimbursement
// surface: only `personal_reimbursable` rows ever flow through the
// `reimbursement_status` lifecycle below.
export const expensePaidByEnum = pgEnum("expense_paid_by", [
  "entity",
  "personal_reimbursable",
  "personal_no_reimburse",
]);

// Reimbursement state for personal-reimbursable expenses. `not_applicable`
// is the default for `paid_by IN ('entity', 'personal_no_reimburse')`
// rows so the column is never NULL — keeps filter queries simple.
// `pending → paid_back` is the only legal forward transition; reverting
// is intentionally not modelled (use a new version + reason instead).
export const reimbursementStatusEnum = pgEnum("reimbursement_status", [
  "not_applicable",
  "pending",
  "paid_back",
]);

// ── Intake inbox (v0.2) ────────────────────────────────────────────────
// Unified cross-entity intake queue. See docs/architecture/intake.md.

// Lifecycle of an intake_item. Receipts-TODO §"Unified intake inbox".
//   new            → just uploaded, OCR may or may not have run
//   needs_review   → OCR finished, waiting on a human to route/confirm
//   routed         → user chose target, hasn't finalised the downstream
//                    Thing yet (split for cases where routing + creation
//                    happen in separate actions, e.g. bulk triage)
//   confirmed      → downstream artifact (receipt, expense, …) created,
//                    item is the audit anchor for that artifact's origin
//   rejected       → user discarded; blob kept for orphan-cleanup stats
export const intakeStatusEnum = pgEnum("intake_status", [
  "new",
  "needs_review",
  "routed",
  "confirmed",
  "rejected",
]);

// OCR job lifecycle on an intake_item. Separate from `intake_status`
// because the two axes are orthogonal — an item can be `confirmed`
// (user already routed it manually) with `ocr_status='failed'`.
export const intakeOcrStatusEnum = pgEnum("intake_ocr_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

// Target downstream flow the user is routing the intake item into.
// Null = undecided (default on a fresh upload). The set matches the
// TODO's "expense/trip/mileage/benefit/compliance evidence" list;
// only `expense` has a real downstream Thing today (receipt). The
// others are surfaced in the UI with a "not available yet" state
// until v0.6 (trips, mileage, benefits) and v0.6+ (compliance) land.
export const intakeTargetFlowEnum = pgEnum("intake_target_flow", [
  "expense",
  "trip",
  "mileage",
  "benefit",
  "compliance_evidence",
]);
