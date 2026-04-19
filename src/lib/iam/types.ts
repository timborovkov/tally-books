// IAM types + enum arrays that both server and client code need. Kept
// separate from `permissions.ts` because that module imports the DB
// client, which cannot be bundled into Client Components.
//
// The ordering here mirrors the `resource_type` pgEnum in
// src/db/schema/enums.ts so invite grants and the admin scope checkbox
// grid show resources in the same order as the spec's §4.4.

export type ResourceType =
  | "invoices"
  | "expenses"
  | "receipts"
  | "payouts"
  | "taxes"
  | "filings"
  | "legal_documents"
  | "estimates"
  | "budgets"
  | "reports"
  | "trips"
  | "benefits"
  | "travel_compensation"
  | "compliance_tasks"
  | "agents"
  | "business_details"
  | "personal_details";

export type AccessLevel = "read" | "write";

export const RESOURCE_TYPES: readonly ResourceType[] = [
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
] as const;
