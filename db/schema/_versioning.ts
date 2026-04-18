/**
 * Versioning primitives — the foundation every "Thing" in Tally is built on.
 *
 * A "Thing" in Tally is any user-visible business object whose state changes
 * over time and where we want full history: invoices, expenses, receipts, VAT
 * declarations, annual reports, balance sheets, budgets, trips, payroll runs,
 * scenarios, billing arrangements.
 *
 * The pattern:
 *
 *   - The "current" table holds one row per Thing with a pointer to its
 *     current version row, plus the "live" flags that are read on every
 *     dashboard query (state, lock flags, refresh flags).
 *
 *   - The "<thing>_version" table holds an immutable snapshot per change:
 *     the full state at that point, the diff from the previous version, who
 *     made the change, why, and when.
 *
 *   - Mutations always go through the `versioned<T>.update()` helper at the
 *     service layer. Direct DB writes are forbidden (enforced by code review,
 *     not the schema).
 *
 * `edit_sessions` and `audit_log` live here because they are part of the
 * versioning story end-to-end.
 */

import { boolean, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/*  Shared enums                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The lifecycle state every Thing can be in. Not every Thing uses every value;
 * for example a `receipt` will typically only ever be `draft` or `ready`.
 */
export const thingStateEnum = pgEnum('thing_state', [
  'draft', // user is still working on it
  'ready', // user marked complete but not yet sent/filed
  'sent', // for invoices: delivered to recipient
  'filed', // for declarations/reports: submitted to the authority
  'amending', // unfiled and being changed before refile
  'void', // soft-deleted; preserved for audit
]);

/**
 * Who or what made a change. `system` covers the recalc worker doing
 * auto-refresh. `agent` covers AI agent writes that the user confirmed.
 */
export const actorKindEnum = pgEnum('actor_kind', ['user', 'system', 'agent']);

/* -------------------------------------------------------------------------- */
/*  Edit sessions — soft locks held by users actively editing a Thing         */
/* -------------------------------------------------------------------------- */

/**
 * An edit_session row exists while a user is on a Thing's editor page. The
 * recalc worker checks for an active session before touching a Thing; if one
 * exists, it queues a "refresh pending" marker instead of writing.
 *
 * Sessions heartbeat every 30s. Anything older than 2 minutes without a
 * heartbeat is considered stale and is GC'd.
 */
export const editSessions = pgTable('edit_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  thingType: text('thing_type').notNull(), // e.g. 'vat_declaration'
  thingId: text('thing_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Audit log — append-only record of significant actions                     */
/* -------------------------------------------------------------------------- */

/**
 * audit_log captures things that aren't visible in a single Thing's version
 * history: logins, permission changes, period locks, integration syncs,
 * agent tool calls (cross-referenced from agent_action), etc.
 *
 * Anything that touches a single Thing's state should ALSO produce a version
 * row on that Thing — audit_log is not a substitute for versioning.
 */
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'), // null for system events with no user context
  actorKind: actorKindEnum('actor_kind').notNull(),
  action: text('action').notNull(), // e.g. 'period.locked', 'invite.sent'
  thingType: text('thing_type'),
  thingId: text('thing_id'),
  payload: jsonb('payload').notNull().default({}),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  versionedTable() — the helper that builds the (current, version) pair    */
/* -------------------------------------------------------------------------- */

/**
 * Mixin: the columns every "current" table needs.
 *
 * Used inside concrete table definitions, e.g.:
 *
 *   export const invoices = pgTable('invoices', {
 *     id: text('id').primaryKey(),
 *     entityId: text('entity_id').notNull().references(() => entities.id),
 *     ...versionedColumns(),
 *     // ...invoice-specific fields
 *   });
 *
 * We use a mixin function rather than `versionedTable()` returning two tables
 * because Drizzle's table inference works best when the table is defined
 * inline in the file that uses it. The version-side is built by
 * `versionTable()` below and convention-named `<thing>_versions`.
 */
export function versionedColumns() {
  return {
    /** Pointer to the current row in the companion `<thing>_versions` table. */
    currentVersionId: text('current_version_id'),
    /** Which lifecycle state this Thing is in right now. */
    state: thingStateEnum('state').notNull().default('draft'),
    /** When `true`, the recalc worker leaves this Thing alone. */
    autoRefreshLocked: boolean('auto_refresh_locked').notNull().default(false),
    /**
     * When `true`, source data has changed since this Thing was last
     * refreshed but the worker was blocked (filed / period-locked /
     * locked / in edit session). Surfaces in UI as a "refresh available"
     * affordance.
     */
    refreshPending: boolean('refresh_pending').notNull().default(false),
    /**
     * For filed Things: source data has changed since filing. The payload
     * column below describes what.
     */
    underlyingDataChanged: boolean('underlying_data_changed').notNull().default(false),
    underlyingDataChangedPayload: jsonb('underlying_data_changed_payload'),
    /**
     * Reference returned by the filing portal (e.g. EMTA receipt id).
     * Only set once `state` reaches `filed`.
     */
    filedRef: text('filed_ref'),
    filedAt: timestamp('filed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  };
}

/**
 * Builder for the companion `<thing>_versions` table. Convention:
 *
 *   export const invoices = pgTable('invoices', { ... versionedColumns() });
 *   export const invoiceVersions = versionTable('invoice_versions', 'invoice_id');
 *
 * `parentColumn` is the column on the version table that points back to the
 * current-state row. We keep this explicit (not magic) so the relationship
 * is greppable.
 *
 * We DO NOT add a Drizzle FK back to the parent table because that creates
 * a circular dependency with `current_version_id` on the parent. The
 * relationship is enforced at the service layer.
 */
export function versionTable(tableName: string, parentColumn: string) {
  return pgTable(tableName, {
    id: text('id').primaryKey(),
    [parentColumn]: text(parentColumn).notNull(),
    versionNum: text('version_num').notNull(), // monotonic per parent, lexicographically sortable
    /** Full snapshot of the Thing's domain state at this version. */
    stateSnapshot: jsonb('state_snapshot').notNull(),
    /** JSON Patch (RFC 6902) from the previous version's snapshot. */
    diff: jsonb('diff').notNull().default([]),
    /** Optional human-readable summary of what changed semantically. */
    semanticSummary: text('semantic_summary'),
    /** The user, system worker, or agent that produced this version. */
    actorId: text('actor_id'),
    actorKind: actorKindEnum('actor_kind').notNull(),
    /** Free-form note from the actor: "fix VAT rate", "reimport from Paperless". */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
}

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type ThingState = (typeof thingStateEnum.enumValues)[number];
export type ActorKind = (typeof actorKindEnum.enumValues)[number];

export type EditSession = typeof editSessions.$inferSelect;
export type NewEditSession = typeof editSessions.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
