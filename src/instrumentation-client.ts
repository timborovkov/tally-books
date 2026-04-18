/**
 * Browser-side Sentry bootstrap. Next.js loads this automatically when
 * `src/instrumentation-client.ts` is present (same convention as the server
 * `instrumentation.ts`).
 *
 * Config is driven by `NEXT_PUBLIC_SENTRY_*` env vars, validated in
 * `@/lib/env.client`. Sentry stays inert unless both the master toggle is
 * `"true"` AND a DSN is set — see `docs/architecture/sentry.md`.
 */
import * as Sentry from "@sentry/nextjs";

import { clientEnv } from "@/lib/env.client";

const dsn = clientEnv.NEXT_PUBLIC_SENTRY_DSN ?? "";
const enabled = clientEnv.NEXT_PUBLIC_SENTRY_ENABLED && dsn !== "";

Sentry.init({
  dsn,
  enabled,
  sendDefaultPii: true,
  tracesSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  replaysOnErrorSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE,
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
