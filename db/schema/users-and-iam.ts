/**
 * Users, sessions, invites, permissions.
 *
 * BetterAuth owns the auth tables in practice (users, sessions, accounts,
 * verification tokens). What lives here is the IAM layer Tally adds on top:
 * scoped invites, scoped per-resource permissions, and the soft-deleted
 * "removed user" trail.
 *
 * The `users` and `sessions` tables here mirror what BetterAuth expects, so
 * Drizzle can join against them. If BetterAuth's expected shape changes,
 * adjust here.
 */

import { boolean, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum('user_role', ['admin', 'member']);

export const accessLevelEnum = pgEnum('access_level', ['read', 'write']);

/**
 * The set of resource types permissions can be scoped to. Mirrors §5.1.3 of
 * the project brief. Adding a new top-level resource = adding it here.
 */
export const resourceTypeEnum = pgEnum('resource_type', [
  'invoices',
  'expenses',
  'receipts',
  'payouts',
  'taxes',
  'filings',
  'legal_documents',
  'estimates',
  'budgets',
  'reports',
  'trips',
  'agents',
  'business_details',
  'personal_details',
]);

/* -------------------------------------------------------------------------- */
/*  Users                                                                     */
/* -------------------------------------------------------------------------- */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: userRoleEnum('role').notNull().default('member'),
  /** TOTP secret for 2FA. Required — see project brief §5.1.3. */
  twoFactorSecret: text('two_factor_secret'),
  twoFactorEnabledAt: timestamp('two_factor_enabled_at', { withTimezone: true }),
  /** Set when admin removes the user. We keep the row for audit linkage. */
  removedAt: timestamp('removed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Invites                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * An admin invites someone by email with a pre-defined permission scope.
 * The invitee follows the link, sets up their account (with 2FA), and the
 * scope is materialized as `permissions` rows for the new user.
 *
 * `scope` here is a snapshot of what the admin chose at invite time —
 * permissions can be edited after acceptance and are NOT kept in sync with
 * this column.
 */
export const invites = pgTable('invites', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  /**
   * Snapshot of the permission set the admin assigned. Shape matches
   * what `permissions` rows will be created from on acceptance.
   * Example: [{ resourceType: 'expenses', resourceScope: { entityId: '...' }, access: 'read' }]
   */
  scope: jsonb('scope').notNull(),
  token: text('token').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedByUserId: text('accepted_by_user_id').references(() => users.id),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by').references(() => users.id),
});

/* -------------------------------------------------------------------------- */
/*  Permissions                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A single grant: "user X has <access> on <resourceType>, optionally scoped
 * to a specific entity / period / etc."
 *
 * `resourceScope` is a structured filter expressed in JSON. Examples:
 *   - `{}` — applies globally to that resource type
 *   - `{ entityId: 'oue_123' }` — scoped to one entity
 *   - `{ entityId: 'oue_123', kinds: ['salary', 'dividend'] }` — narrower
 *
 * The IAM helper at the service layer is responsible for evaluating scope
 * against incoming requests. Always evaluate in code, never trust client.
 *
 * Admins implicitly have full access to everything; their `users.role`
 * short-circuits the permission check.
 */
export const permissions = pgTable('permissions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  resourceType: resourceTypeEnum('resource_type').notNull(),
  resourceScope: jsonb('resource_scope').notNull().default({}),
  access: accessLevelEnum('access').notNull(),
  grantedBy: text('granted_by')
    .notNull()
    .references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  /** When set, this permission is no longer in effect. We don't delete rows. */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by').references(() => users.id),
});

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type AccessLevel = (typeof accessLevelEnum.enumValues)[number];
export type ResourceType = (typeof resourceTypeEnum.enumValues)[number];

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
