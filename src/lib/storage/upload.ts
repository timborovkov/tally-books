/**
 * Streaming upload service. Pipes an incoming `Readable` straight to
 * MinIO while simultaneously hashing + counting bytes, then records a
 * `blobs` row.
 *
 * Why streaming: receipts are often multi-MB PDFs or phone photos, and
 * server actions / route handlers in Next.js run in Node serverless-
 * style execution. Buffering the whole body into memory would cap our
 * effective upload size at whatever RAM the container has free. The
 * `PassThrough` fan-out here keeps memory bounded to whatever the MinIO
 * SDK internally buffers (a single 5MB part by default).
 *
 * Dedupe: after the hash is known we check for an existing blob with
 * the same `(bucket, sha256)` and reuse its row. That matters for the
 * intake inbox — users routinely drag the same receipt in twice (once
 * from their phone, once from email forwarding), and we don't want two
 * MinIO objects nor two intake items fighting over the same truth.
 * The already-uploaded object is left alone (overwriting it would cost
 * a round-trip for no gain since the content is identical by hash).
 */
import { createHash } from "node:crypto";
import { PassThrough, type Readable } from "node:stream";

import { and, eq } from "drizzle-orm";

import { newId } from "@/db/id";
import type { Db } from "@/db/client";
import { blobs, type Blob } from "@/db/schema";

import { type BucketName } from "./buckets";
import { getStorageClient } from "./client";

export interface PutBlobInput {
  bucket: BucketName;
  /** The raw bytes. Will be consumed exactly once. */
  stream: Readable;
  /** MIME type for downstream Content-Type headers. */
  contentType: string;
  /**
   * Original filename from the uploader. Not used for the object key
   * (which is always cuid-based to avoid collisions), but preserved
   * in the extension of the key so operators browsing the MinIO
   * console can spot a `.jpg` vs a `.pdf` at a glance.
   */
  filename?: string;
  /** User to attribute the `uploaded_by_id` column to. */
  uploadedById: string | null;
}

export interface PutBlobResult {
  blob: Blob;
  /** True when the upload deduplicated against an existing blob row. */
  deduplicated: boolean;
}

/**
 * Derive a `yyyy/mm/<cuid>.<ext>` object key. The date prefix keeps
 * MinIO object listings paginated chronologically for operators;
 * `newId()` is the collision-free core; the extension is best-effort
 * from the filename and falls back to `bin`.
 */
function makeObjectKey(filename: string | undefined): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = filename && filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
  // Guard against path traversal / weird ext values — cap length and
  // restrict charset. MinIO would accept almost anything, but we don't
  // want `..` showing up in an object key.
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
  return `${yyyy}/${mm}/${newId()}.${safeExt}`;
}

export async function putBlob(db: Db, input: PutBlobInput): Promise<PutBlobResult> {
  const client = getStorageClient();
  const objectKey = makeObjectKey(input.filename);

  // Fan the readable into two consumers: one to MinIO, one to the
  // hasher / counter. We `pipe()` into both PassThroughs so Node
  // handles backpressure — if MinIO's multipart upload falls behind
  // the incoming stream, the source pauses rather than buffering the
  // whole upload in memory. A raw `on("data") + write()` fan-out
  // would ignore the boolean return from `write()` and grow
  // unbounded on large receipts.
  const toMinio = new PassThrough();
  const toHasher = new PassThrough();
  input.stream.on("error", (err) => {
    toMinio.destroy(err);
    toHasher.destroy(err);
  });
  input.stream.pipe(toMinio);
  input.stream.pipe(toHasher);

  const hasher = createHash("sha256");
  let sizeBytes = 0;
  const hashDone = new Promise<{ sha256: string; sizeBytes: number }>((resolve, reject) => {
    toHasher.on("data", (chunk: Buffer) => {
      hasher.update(chunk);
      sizeBytes += chunk.length;
    });
    toHasher.on("end", () => resolve({ sha256: hasher.digest("hex"), sizeBytes }));
    toHasher.on("error", reject);
  });

  // MinIO SDK takes `size` optional when streaming; passing `undefined`
  // is the documented path for unknown-size streams and it'll use
  // multipart automatically beyond the 5MB threshold.
  const putPromise = client.putObject(input.bucket, objectKey, toMinio, undefined, {
    "Content-Type": input.contentType,
  });

  const [{ sha256 }] = await Promise.all([hashDone, putPromise]);

  // Dedupe: same (bucket, sha256) means we already have this content.
  // Delete the just-uploaded duplicate object so we keep storage clean;
  // keep the *existing* blob row as the canonical reference. The extra
  // round-trip here is cheap compared to letting MinIO grow linearly
  // with every duplicate receipt upload.
  const [existing] = await db
    .select()
    .from(blobs)
    .where(and(eq(blobs.bucket, input.bucket), eq(blobs.sha256, sha256)))
    .limit(1);
  if (existing) {
    await client.removeObject(input.bucket, objectKey);
    return { blob: existing, deduplicated: true };
  }

  const [row] = await db
    .insert(blobs)
    .values({
      bucket: input.bucket,
      objectKey,
      contentType: input.contentType,
      sizeBytes,
      sha256,
      uploadedById: input.uploadedById,
    })
    .returning();
  if (!row) {
    // Shouldn't happen — the insert above has no conflict target. If
    // it does, the MinIO object is orphaned; the v1.0 cleanup job
    // sweeps blobs-without-rows by scanning bucket vs table.
    throw new Error("Failed to record uploaded blob");
  }
  return { blob: row, deduplicated: false };
}
