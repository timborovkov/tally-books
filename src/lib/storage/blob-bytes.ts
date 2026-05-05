import { GetObjectCommand } from "@aws-sdk/client-s3";

import type { BucketName } from "./buckets";
import { getStorageClient } from "./client";

/**
 * Read a blob's raw bytes into a Buffer. Used by the PDF renderer to
 * embed an entity's logo into the rendered output. Streams the response
 * via `transformToByteArray()` so we don't have to construct a
 * Node `Readable` and re-buffer it ourselves.
 *
 * Use this only when you actually need the bytes in-process (PDF
 * rendering, email attachments). For browser-served downloads, prefer
 * `presignBlobGetUrl` to keep traffic off the app process.
 */
export async function getBlobBytes(bucket: BucketName, objectKey: string): Promise<Buffer> {
  const client = getStorageClient();
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!out.Body) {
    throw new Error(`Storage backend returned empty body for ${bucket}/${objectKey}`);
  }
  // `transformToByteArray` is the SDK-runtime-agnostic way to fully
  // buffer a body — works in Node, Edge, Bun without per-runtime
  // instanceof checks.
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes);
}
