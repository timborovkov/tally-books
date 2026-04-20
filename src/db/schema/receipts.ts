import { sql } from "drizzle-orm";
import {
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

import { entities } from "./entities";
import { actorKindEnum } from "./enums";
import { users } from "./users";
import { versionedColumns } from "./versioning";

/**
 * First real versioned Thing. docs/data-model.md §3.1–§3.2 + v0.1 TODO
 * "Versioning engine". Minimal v0.1 shape — OCR, vision, intake inbox
 * etc. arrive in v0.2 and extend this table rather than replace it.
 *
 * `current_version_id` is deliberately NOT wired with a FK in this
 * Drizzle definition. Drizzle-kit cannot emit the
 * `DEFERRABLE INITIALLY DEFERRED` constraint we need (§3.1), so the FK
 * is added by hand in the migration SQL right after drizzle-kit emits
 * the base CREATE TABLE. The typed column is still here so selects /
 * updates stay type-safe.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    // Economic date — the day the purchase / payment happened. Drives
    // period-lock lookups and ordering. Distinct from `created_at`
    // which is just the row-insertion timestamp.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    vendor: text("vendor").notNull(),
    amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
    currency: text("currency").notNull(),
    notes: text("notes"),
    // Hand-wired DEFERRABLE FK in migration SQL (see above).
    currentVersionId: text("current_version_id"),
    ...versionedColumns(),
  },
  (t) => [
    index("receipts_entity_occurred_idx").on(t.entityId, t.occurredAt.desc()),
    index("receipts_state_active_idx")
      .on(t.state)
      .where(sql`${t.state} <> 'void'`),
  ],
);

export const receiptVersions = pgTable(
  "receipt_versions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    versionNum: integer("version_num").notNull(),
    stateSnapshot: jsonb("state_snapshot").notNull(),
    diff: jsonb("diff")
      .notNull()
      .default(sql`'[]'::jsonb`),
    semanticSummary: text("semantic_summary"),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: actorKindEnum("actor_kind").notNull(),
    // Bridge to the future agent_actions table. Free text today; the
    // FK is added when that table lands.
    agentId: text("agent_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("receipt_versions_monotonic").on(t.receiptId, t.versionNum),
    index("receipt_versions_receipt_ver_idx").on(t.receiptId, t.versionNum.desc()),
    index("receipt_versions_created_at_idx").on(t.createdAt),
  ],
);

export type Receipt = typeof receipts.$inferSelect;
export type ReceiptVersion = typeof receiptVersions.$inferSelect;
