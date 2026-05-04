/**
 * Bucket registry and idempotent provisioning.
 *
 * Every blob lives in one of the fixed buckets declared below — adding
 * a new bucket is a deliberate act, not something code paths grow
 * sideways. The `receipts`, `invoices`, `legal-docs`, `exports` split
 * comes straight from the v0.2 TODO.
 *
 * `ensureBuckets()` is called once at boot from `instrumentation.ts`
 * so a fresh RustFS instance gets its buckets created on first app
 * start. `HeadBucketCommand` is the cheap existence probe; on miss we
 * follow with `CreateBucketCommand`. Safe to call every boot — on an
 * already-provisioned deployment it's four `HEAD` requests per process
 * start and nothing else.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";

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
    if (await bucketExists(client, bucket)) continue;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function bucketExists(
  client: ReturnType<typeof getStorageClient>,
  bucket: BucketName,
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (err) {
    // S3 returns 404 (NotFound) for missing buckets and 301 (PermanentRedirect)
    // when the bucket exists but lives in another region — treat the redirect
    // as "exists" so we don't try to recreate someone else's bucket. Anything
    // else (auth failure, network) bubbles up as the boot-time error we want.
    if (err instanceof S3ServiceException) {
      const status = err.$metadata.httpStatusCode;
      if (status === 404) return false;
      if (status === 301) return true;
    }
    throw err;
  }
}
