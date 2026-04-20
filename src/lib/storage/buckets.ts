/**
 * Bucket registry and idempotent provisioning.
 *
 * Every blob lives in one of the fixed buckets declared below — adding
 * a new bucket is a deliberate act, not something code paths grow
 * sideways. The `receipts`, `invoices`, `legal-docs`, `exports` split
 * comes straight from the v0.2 TODO.
 *
 * `ensureBuckets()` is called once at boot from `instrumentation.ts`
 * so a fresh MinIO instance gets its buckets created on first app
 * start. The SDK's `makeBucket` errors if the bucket already exists,
 * so we gate it on `bucketExists`. Safe to call every boot — on an
 * already-provisioned deployment it's four `HEAD` requests per process
 * start and nothing else.
 */
import { getStorageClient } from "./client";

export const BUCKETS = {
  receipts: "receipts",
  invoices: "invoices",
  legalDocs: "legal-docs",
  exports: "exports",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

const ALL_BUCKETS: readonly BucketName[] = Object.values(BUCKETS);

/**
 * Create any missing buckets. Idempotent. Safe to call at every process
 * start. Errors from a single bucket surface immediately rather than
 * being swallowed — a missing bucket means uploads will fail and we
 * want startup to fail loudly instead.
 */
export async function ensureBuckets(): Promise<void> {
  const client = getStorageClient();
  for (const bucket of ALL_BUCKETS) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      // Region defaults to `us-east-1` in MinIO when unspecified. Works
      // for both local MinIO and AWS S3; hosted MinIO deployments that
      // need a specific region should override here.
      await client.makeBucket(bucket);
    }
  }
}
