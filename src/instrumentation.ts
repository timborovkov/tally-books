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

    // Provision RustFS buckets on first boot. Idempotent — on an
    // already-provisioned deployment this is four HEAD requests per
    // cold start and nothing else. Ignored on edge because RustFS
    // isn't reachable from the edge runtime.
    //
    // Skipped during tests: the integration suite manages its own
    // storage lifecycle and the unit suite stubs the SDK out entirely.
    if (process.env.NODE_ENV !== "test") {
      try {
        const { ensureBuckets } = await import("@/lib/storage");
        await ensureBuckets();
      } catch (err) {
        // Don't kill the process — a running app that can't reach
        // RustFS is still useful for read-only pages, and the upload
        // route will surface a clearer error when the user actually
        // tries to upload. Just log so ops sees it in Sentry.
        console.error("[storage] ensureBuckets failed at boot:", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("@/sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
