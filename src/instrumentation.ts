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

      // Start pg-boss workers in the same process as the HTTP server.
      // Workers used to be a separate Railway service; they're now
      // co-resident with the web tier — single process, single set
      // of env vars, half the deploy cost. pg-boss's row-locking
      // semantics (FOR UPDATE SKIP LOCKED) mean horizontally-scaled
      // web instances each run their own poller without duplicating
      // work. If OCR throughput ever needs to scale independently,
      // re-extract a worker entry point and add a separate service.
      //
      // Failures are logged but non-fatal: a process that can't
      // start workers can still serve requests, and the enqueue
      // path will surface an error when a route tries to send a job.
      try {
        const { startWorkers } = await import("@/lib/jobs");
        await startWorkers();
      } catch (err) {
        console.error("[jobs] startWorkers failed at boot:", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("@/sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
