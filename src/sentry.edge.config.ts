/**
 * Edge runtime Sentry bootstrap.
 * Loaded from `src/instrumentation.ts` when `NEXT_RUNTIME === "edge"`.
 *
 * DSN comes from `NEXT_PUBLIC_SENTRY_DSN` — same single DSN as the server
 * and client. No profiling: `@sentry/profiling-node` depends on native Node
 * bindings that aren't available in the edge runtime.
 */
import * as Sentry from "@sentry/nextjs";

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
});
