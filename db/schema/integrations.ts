/**
 * Integration configs — what's enabled, what's been synced, when.
 *
 * Secrets (API keys, tokens) live in `.env` ONLY. This table holds the
 * non-secret state: which integration in which catalog is enabled, the
 * non-secret parameters the user picked (e.g. Paperless-ngx folder
 * filter, default category for synced receipts), and sync metadata.
 *
 * Adding a new integration = adding an entry to the appropriate catalog
 * (`integrations/invoicing/catalog.ts` etc.) AND, when the user enables
 * it, an `integration_configs` row appears here.
 */

import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const integrationConfigs = pgTable('integration_configs', {
  id: text('id').primaryKey(),
  /** Matches an `id` in one of the integration catalogs. */
  catalogId: text('catalog_id').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  /** User-chosen non-secret params: folder filters, default mappings, etc. */
  params: jsonb('params').notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status'),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type NewIntegrationConfig = typeof integrationConfigs.$inferInsert;
