/**
 * embedding_index — bookkeeping for what's in Qdrant.
 *
 * Vectors themselves live in Qdrant (see `src/lib/search/`). This table
 * records: which artifact got embedded, into which collection, with what
 * model, when, and a content hash so we can detect drift.
 *
 * The ingestion worker:
 *   1. Receives a domain event (e.g. `expense.updated`).
 *   2. Builds the normalized text representation.
 *   3. Hashes it; if the hash matches `text_hash` in this table, skips.
 *   4. Otherwise: embeds, upserts to Qdrant, updates this row.
 *
 * Deletes in the source domain → mark this row deleted and remove the
 * Qdrant point. (Soft delete: keep the row but set `deletedAt`, useful for
 * debugging "why did this disappear from search?")
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const embeddingIndex = pgTable('embedding_index', {
  id: text('id').primaryKey(),
  /** Qdrant collection name. */
  collection: text('collection').notNull(),
  /** Domain artifact type, e.g. 'expense', 'invoice', 'document'. */
  sourceKind: text('source_kind').notNull(),
  sourceId: text('source_id').notNull(),
  /** Stable id used as the Qdrant point id. */
  qdrantPointId: text('qdrant_point_id').notNull(),
  /** Hash of the normalized text we embedded. SHA-256. */
  textHash: text('text_hash').notNull(),
  /** Embedding model identifier. */
  model: text('model').notNull(),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type EmbeddingIndexEntry = typeof embeddingIndex.$inferSelect;
export type NewEmbeddingIndexEntry = typeof embeddingIndex.$inferInsert;
