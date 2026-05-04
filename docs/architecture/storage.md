# Storage

All binary content (receipt scans, invoice PDFs, legal documents, exports) is stored in RustFS — a Rust-based, S3-compatible object store that runs as the local dev container and any self-host. The app speaks the S3 protocol via the AWS SDK v3 (`@aws-sdk/client-s3`), so any S3-compatible backend (RustFS, AWS S3, Backblaze B2, etc.) works without code changes; only the endpoint and credentials change. The app never stores bytes in Postgres. Every byte that leaves the browser lands in one of four buckets, keyed in the `blobs` table.

Source of truth for the code: [`src/lib/storage/`](../../src/lib/storage).

## Buckets

Declared in [`src/lib/storage/buckets.ts`](../../src/lib/storage/buckets.ts):

| Constant            | Bucket       | Contents                                                |
| ------------------- | ------------ | ------------------------------------------------------- |
| `BUCKETS.receipts`  | `receipts`   | Receipt scans uploaded through the intake inbox.        |
| `BUCKETS.invoices`  | `invoices`   | Generated invoice PDFs.                                 |
| `BUCKETS.legalDocs` | `legal-docs` | Contracts, certificates, entity-registration documents. |
| `BUCKETS.exports`   | `exports`    | CSV / XLSX / ZIP exports the user requests.             |

`ensureBuckets()` is called once at boot from [`src/instrumentation.ts`](../../src/instrumentation.ts). It's idempotent (`HeadBucketCommand` → `CreateBucketCommand` only when the bucket returns 404), so fresh RustFS deployments get provisioned automatically and existing ones pay four HEAD requests per cold start.

## The `blobs` table

```
id            text pk
bucket        text not null               -- one of BUCKETS.*
object_key    text not null               -- yyyy/mm/<cuid>.<ext>
content_type  text not null               -- MIME type
size_bytes    bigint not null
sha256        text not null               -- hex-encoded SHA-256
uploaded_by_id text fk(users.id, set null)
uploaded_at   timestamptz not null default now()
unique(bucket, object_key)
index(bucket, sha256)                     -- dedupe lookups
```

**Immutable once written.** Domain rows link to blobs; blobs never link back. Deleting a blob requires that no live domain row still references it (FKs use `onDelete: restrict`).

## Upload pipeline

[`putBlob()`](../../src/lib/storage/upload.ts) takes a `Readable`, pipes it simultaneously to:

1. RustFS via `@aws-sdk/lib-storage`'s `Upload` (multipart-chunks the body in 5 MB parts and applies backpressure).
2. A SHA-256 hasher + byte counter.

Both consumers get the same bytes via a `PassThrough` fan-out — no intermediate full-file buffer, so memory stays bounded regardless of upload size.

After both streams close, we have the hash. Dedupe runs at that point:

- If `(bucket, sha256)` already exists in `blobs`, the just-uploaded object is removed via `DeleteObjectCommand` and the existing blob row is returned with `deduplicated: true`.
- Otherwise a new `blobs` row is inserted and returned.

This matters for the intake inbox — users routinely drag the same receipt in twice (phone + email forwarding) and we don't want duplicate stored objects fighting over the same truth.

## Downloads

Private buckets. Downloads are never proxied through the Next.js server. Instead, [`presignBlobGetUrl()`](../../src/lib/storage/download.ts) uses `@aws-sdk/s3-request-presigner` to mint a short-lived (5-minute default) signed URL, and the browser loads the object directly from RustFS.

The app-level endpoint [`GET /api/blobs/[id]`](../../src/app/api/blobs/[id]/route.ts) checks the session + 2FA, looks up the blob row, and redirects to the presigned URL. Pages embed `/api/blobs/<id>` as the `src` of an `<img>` or `<a>` so browsers follow the redirect transparently.

## Env

```
S3_ENDPOINT=http://localhost:9000        # full URL; the SDK derives TLS from scheme
S3_REGION=us-east-1                       # required by the SDK; value is not validated by RustFS
S3_ACCESS_KEY_ID=tally
S3_SECRET_ACCESS_KEY=tally-dev-secret
S3_FORCE_PATH_STYLE=true                  # default; flip to false only for vhost-style providers (AWS S3)
```

Production deployments point these at remote S3 or a hosted RustFS cluster. The compose-only `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` are used to boot the local container — only needed when running `docker compose up`.

## Orphan cleanup

Not a v0.2 concern. A blob row with no referring domain row (no `receipts.blob_id`, no `intake_items.blob_id`, no invoice attachments yet) is an orphan and eventually gets swept — see the v1.0 "full-backup export" item as the vehicle for that job. Today, if `putBlob` succeeds but the subsequent domain write fails, we accept the orphan.

## Integration-test harness

See the intake integration test (`src/domains/intake/__tests__/intake.integration.test.ts`) for the pattern — it provisions buckets inline then writes + reads blobs against the live RustFS container.
