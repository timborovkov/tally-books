/**
 * Lazily-constructed MinIO client singleton.
 *
 * The MinIO SDK takes host + port + useSSL as separate fields, but we
 * express the endpoint as a single URL env var (`MINIO_ENDPOINT`) so
 * operators don't have to split host from port in `.env` and so the
 * `MINIO_USE_SSL` default matches the URL scheme automatically when
 * they forget to set it. Parsing happens here, once, behind a cached
 * factory — the runtime client lives for the process lifetime the same
 * way `getDb()` does.
 *
 * CLI scripts and integration tests should build their own client if
 * they want explicit lifecycle control.
 */
import { Client } from "minio";

import { env } from "@/lib/env";

let cached: Client | null = null;

export function getStorageClient(): Client {
  if (!cached) {
    const url = new URL(env.MINIO_ENDPOINT);
    // If MINIO_USE_SSL is explicitly set we trust it; otherwise derive
    // from the URL scheme so a local http:// endpoint doesn't get SSL
    // forced on it just because someone forgot to flip the flag.
    const useSSL = env.MINIO_USE_SSL || url.protocol === "https:";
    const defaultPort = url.protocol === "https:" ? 443 : 80;
    const port = url.port ? Number(url.port) : defaultPort;

    cached = new Client({
      endPoint: url.hostname,
      port,
      useSSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
  }
  return cached;
}
