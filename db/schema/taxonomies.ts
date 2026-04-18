/**
 * Taxonomies: hierarchical categories.
 *
 * Categories are scoped to entity, personal, or `global`. Default sets are
 * shipped per jurisdiction. Users can add their own.
 *
 * `kind` matches the accounting domain (income / expense / asset / liability
 * / equity) — used by report generators to pick the right buckets.
 *
 * `code` is an optional accounting code (chart-of-accounts style). Some
 * jurisdictions effectively require these for filings; others don't care.
 */

import { jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities-and-jurisdictions';

export const categoryKindEnum = pgEnum('category_kind', [
  'income',
  'expense',
  'asset',
  'liability',
  'equity',
]);

export const categoryScopeEnum = pgEnum('category_scope', [
  'entity', // applies to a specific entity (entityId set)
  'personal', // applies to the personal pseudo-entity
  'global', // applies everywhere (default categories)
]);

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  scope: categoryScopeEnum('scope').notNull(),
  /** Set when `scope = 'entity'`. Null otherwise. */
  entityId: text('entity_id').references(() => entities.id),
  name: text('name').notNull(),
  /** Hierarchical: parent → children. Top-level rows have null. */
  parentId: text('parent_id'),
  kind: categoryKindEnum('kind').notNull(),
  code: text('code'),
  metadata: jsonb('metadata').notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CategoryKind = (typeof categoryKindEnum.enumValues)[number];
export type CategoryScope = (typeof categoryScopeEnum.enumValues)[number];

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
