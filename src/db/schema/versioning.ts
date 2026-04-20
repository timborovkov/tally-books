import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { actorKindEnum, thingStateEnum, thingTypeEnum } from "./enums";
import { users } from "./users";

/**
 * Columns every versioned Thing shares (docs/data-model.md §3.1).
 *
 * Spread into a versioned table:
 *
 * ```ts
 * export const receipts = pgTable("receipts", {
 *   id: text("id").primaryKey().$defaultFn(newId),
 *   // ...domain columns
 *   ...versionedColumns(),
 *   currentVersionId: currentVersionIdColumn(receiptVersions), // future helper
 * });
 * ```
 *
 * `current_version_id` is deliberately NOT included here. It needs a FK
 * to the table-specific `<thing>_versions` table with `DEFERRABLE
 * INITIALLY DEFERRED` semantics so the parent and its first version row
 * can be inserted in the same transaction. drizzle-kit cannot emit
 * `DEFERRABLE` today; the next milestone (the first versioned Thing)
 * will add a sibling helper plus a hand-edited SQL migration that
 * mutates the FK constraint after `db:generate` runs.
 *
 * No versioned tables exist in v0.1, so this helper is exported but
 * unused. It locks in the column shape so the next PR is mechanical.
 */
export function versionedColumns() {
  return {
    state: thingStateEnum("state").notNull().default("draft"),
    autoRefreshLocked: boolean("auto_refresh_locked").notNull().default(false),
    refreshPending: boolean("refresh_pending").notNull().default(false),
    underlyingDataChanged: boolean("underlying_data_changed").notNull().default(false),
    underlyingDataChangedPayload: jsonb("underlying_data_changed_payload"),
    filedRef: text("filed_ref"),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    disclaimerDismissedAt: timestamp("disclaimer_dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  };
}

// docs/data-model.md §3.3 — soft locks. One editor per Thing at a time.
export const editSessions = pgTable(
  "edit_sessions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    thingType: thingTypeEnum("thing_type").notNull(),
    // No FK — polymorphic. Service layer validates.
    thingId: text("thing_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    // 30s heartbeat from client; GC sweep evicts anything older than 2 min.
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("edit_sessions_one_per_thing").on(t.thingType, t.thingId),
    index("edit_sessions_heartbeat_idx").on(t.lastHeartbeatAt),
  ],
);

// docs/data-model.md §3.4.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: actorKindEnum("actor_kind").notNull(),
    agentId: text("agent_id"),
    // e.g. `period.locked`, `invite.sent`. Loose by design.
    action: text("action").notNull(),
    thingType: thingTypeEnum("thing_type"),
    thingId: text("thing_id"),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_thing_at_idx").on(t.thingType, t.thingId, t.at.desc()),
    index("audit_log_actor_at_idx").on(t.actorId, t.at.desc()),
    index("audit_log_at_idx").on(t.at.desc()),
  ],
);

export type EditSession = typeof editSessions.$inferSelect;
export type NewEditSession = typeof editSessions.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
