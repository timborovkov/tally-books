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
  sendDefaultPii: true,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
  integrations: [nodeProfilingIntegration()],
});
