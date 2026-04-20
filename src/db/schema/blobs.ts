import { index, pgTable, text, timestamp, unique, bigint } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { users } from "./users";

/**
 * Content-addressable pointer to an object in MinIO. One row per
 * stored file. Immutable once written — blobs are never edited in
 * place; callers upload a new blob and link to it instead.
 *
 * Why a table instead of storing the key inline on consumers:
 *   - Lets us dedupe by sha256 (index below). Uploading the same
 *     receipt scan twice produces one MinIO object, not two.
 *   - Decouples MinIO object lifecycle from domain rows. A receipt
 *     can be voided without dropping the underlying scan; a future
 *     orphan-cleanup job walks blobs with no referring rows.
 *   - Centralises content-type and size so the download endpoint
 *     doesn't have to call MinIO just to set response headers.
 *
 * Not versioned. Blobs are immutable by contract.
 */
export const blobs = pgTable(
  "blobs",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    // One of BUCKETS.* in src/lib/storage/buckets.ts. Stored as text
    // rather than an enum because the bucket set is app-layer config,
    // not a database-level constraint; expanding it shouldn't require
    // a migration.
    bucket: text("bucket").notNull(),
    // Canonical object path inside the bucket (e.g. `2026/04/<cuid>.jpg`).
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    // bigint because receipts can plausibly be >2GB PDFs once multi-page
    // archives land — integer would cap at 2.1GB.
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    // Hex-encoded SHA-256 of the raw bytes. Used for dedupe.
    sha256: text("sha256").notNull(),
    uploadedById: text("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per actual MinIO object — two different domain uploads
    // of the same file-in-memory MAY dedupe to the same row (via
    // sha256) but two rows cannot point at the same object key.
    unique("blobs_bucket_key_uniq").on(t.bucket, t.objectKey),
    // Dedupe lookups ("do we already have this sha256 in this bucket?").
    index("blobs_bucket_sha256_idx").on(t.bucket, t.sha256),
  ],
);

export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;
