/**
 * Blobs — references to objects in MinIO. The actual bytes never live in
 * Postgres; this table is bookkeeping (which bucket, which key, what mime,
 * who uploaded, integrity check).
 *
 * Every uploaded file gets a blob row before any domain table references it.
 */

import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users-and-iam';

export const blobs = pgTable('blobs', {
  id: text('id').primaryKey(),
  /** MinIO bucket name. */
  bucket: text('bucket').notNull(),
  /** Object key within the bucket. */
  key: text('key').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  /** SHA-256 of the contents — used to detect duplicates and verify integrity. */
  checksum: text('checksum').notNull(),
  uploadedBy: text('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').notNull().default({}),
});

export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;
