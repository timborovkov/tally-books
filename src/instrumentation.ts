/**
 * Next.js calls `register` once per server process at startup.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Side-effect import of `@/lib/env` runs the zod validation immediately,
 * so a misconfigured deploy fails at boot instead of crashing on the
 * first request that touches a bad value.
 *
 * Sentry server/edge config is loaded lazily per runtime so the edge
 * bundle never imports Node-only modules.
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  await import("@/lib/env");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("@/sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
