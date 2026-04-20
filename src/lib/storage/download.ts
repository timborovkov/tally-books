/**
 * Presigned-URL issuer for private blob reads.
 *
 * Blob downloads never go through the Next.js server — that would turn
 * every receipt thumbnail fetch into a proxied roundtrip through the
 * app process. Instead, the app mints a short-lived signed URL pointing
 * directly at MinIO, and the browser loads the object from there.
 *
 * TTL is deliberately short (5 min default). Pages that embed blob URLs
 * are server-rendered and the URL is valid as long as the rendered HTML
 * is on the screen; for intake-inbox thumbnails this is much more than
 * enough. A longer TTL would let URLs leak into browser history / logs
 * and remain usable past the session they were minted in.
 */
import type { Readable } from "node:stream";

import { getStorageClient } from "./client";
import type { BucketName } from "./buckets";

export const DEFAULT_PRESIGN_TTL_SECONDS = 5 * 60;

export async function presignBlobGetUrl(
  bucket: BucketName,
  objectKey: string,
  ttlSeconds: number = DEFAULT_PRESIGN_TTL_SECONDS,
): Promise<string> {
  const client = getStorageClient();
  return client.presignedGetObject(bucket, objectKey, ttlSeconds);
}

/**
 * Stream a blob's bytes straight from MinIO. Used by the download
 * route handler when we want to serve content with app-level auth
 * (e.g. embedding into a PDF export) rather than hand out a presigned
 * URL. Callers are responsible for piping the result to the response.
 */
export async function getBlobStream(bucket: BucketName, objectKey: string): Promise<Readable> {
  const client = getStorageClient();
  return client.getObject(bucket, objectKey);
}
