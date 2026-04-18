/**
 * Server runtime (Node.js) Sentry bootstrap.
 * Loaded from `src/instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`.
 *
 * DSN comes from `NEXT_PUBLIC_SENTRY_DSN` — a single DSN powers client +
 * server + edge runtimes. SDK stays inert unless the master toggle is
 * `"true"` AND a DSN is set. See `docs/architecture/sentry.md`.
 */
import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

import { env } from "@/lib/env";
import { clientEnv } from "@/lib/env.client";

const dsn = clientEnv.NEXT_PUBLIC_SENTRY_DSN ?? "";
const enabled = clientEnv.NEXT_PUBLIC_SENTRY_ENABLED && dsn !== "";

Sentry.init({
  dsn,
  enabled,
  environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  // `sendDefaultPii` attaches request metadata to events: client IP, cookies,
  // Authorization/other headers, and request body fragments. Defaulted to
  // `false` because `.env.example` ships the real Tally DSN; a self-hoster
  // who flips the master toggle without changing the DSN shouldn't leak
  // their operators' PII into a shared Sentry project. Stack traces +
  // breadcrumbs are still captured. Flip to `true` only when you own the
  // destination project and have a lawful basis for the data.
  sendDefaultPii: false,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  // Profiling is gated by two sample rates multiplied together
  // (profilesSampleRate × tracesSampleRate). With the 0.1 × 0.1 default
  // ~1% of requests carry a profile — low overhead in production.
  profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
  integrations: [
    // Node profiling: CPU sampling via native bindings. Must be explicit —
    // `@sentry/nextjs` alone doesn't pull in the profiling integration.
    nodeProfilingIntegration(),
  ],
});
