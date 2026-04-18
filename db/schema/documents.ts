/**
 * Documents — legal docs, contracts, government mail, insurance papers, tax
 * guides, anything the user wants stored with metadata and made searchable.
 *
 * Documents are NOT versioned in the same way as Things. A document represents
 * an external artifact (a signed contract, a tax authority guide) — the
 * user replaces it with a new document if it changes, rather than versioning
 * the old one. The document store cares about discoverability and RAG access,
 * not about diffing.
 *
 * Documents are also the storage backing for billing arrangement attachments,
 * employee/contractor contracts, and similar.
 */

import { jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { entities } from './entities-and-jurisdictions';
import { blobs } from './blobs';
import { users } from './users-and-iam';

/**
 * Document kinds. The set is open — `metadata.kind` can carry sub-types.
 * Kept reasonably broad so the UI can group sensibly.
 */
export const documentKindEnum = pgEnum('document_kind', [
  'contract',
  'addendum',
  'invoice_received',
  'filing',
  'government_mail',
  'insurance',
  'guide', // tax guides, legislation, PWC summaries
  'identification',
  'other',
]);

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  kind: documentKindEnum('kind').notNull(),
  /** Null when the document is global (e.g. a PWC tax summary). */
  entityId: text('entity_id').references(() => entities.id),
  blobId: text('blob_id')
    .notNull()
    .references(() => blobs.id),
  title: text('title').notNull(),
  /** Counterparties / signers / authorities — array of { name, role, partyId? }. */
  parties: jsonb('parties').notNull().default([]),
  /** Significant dates — { signedAt, effectiveFrom, expiresAt, ... }. */
  dates: jsonb('dates').notNull().default({}),
  /** Free-form tags for the user's own organization. */
  tags: jsonb('tags').notNull().default([]),
  /** Plain-text extraction for full-text search and embedding. */
  extractedText: text('extracted_text'),
  metadata: jsonb('metadata').notNull().default({}),
  uploadedBy: text('uploaded_by').references(() => users.id),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentKind = (typeof documentKindEnum.enumValues)[number];

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
