/**
 * Lazily-constructed S3 client singleton.
 *
 * The AWS SDK v3 `S3Client` speaks the S3 wire protocol; pointed at any
 * S3-compatible endpoint (RustFS in dev / self-host, AWS S3 in managed
 * deploys) it works the same way. Configuration arrives as a single
 * endpoint URL (`S3_ENDPOINT`) so operators don't have to split host
 * from port in `.env`; the SDK derives TLS from the URL scheme.
 *
 * `forcePathStyle` defaults to true because RustFS and most self-hosted
 * S3 implementations expect path-style URLs (`/<bucket>/<key>`); set
 * `S3_FORCE_PATH_STYLE=false` only when targeting AWS S3 itself or
 * another vhost-style provider.
 *
 * The runtime client lives for the process lifetime, mirroring the
 * `getDb()` cache. CLI scripts and integration tests can build their
 * own client when they want explicit lifecycle control.
 */
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

import { env } from "@/lib/env";

let cached: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (!cached) {
    cached = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 3000,
        socketTimeout: 30000,
      }),
    });
  }
  return cached;
}
