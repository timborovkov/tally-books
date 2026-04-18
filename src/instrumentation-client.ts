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
  environment: clientEnv.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // `sendDefaultPii` attaches user-identifying data to events: the viewer's
  // IP address, cookies from `document.cookie`, and request headers. We
  // default to `false` because `.env.example` ships the real Tally DSN
  // (`irmin-dw/tally-books`), so any self-hosted install that flips the
  // master toggle without swapping the DSN would pipe its operators' PII
  // into a shared project. Stack traces + breadcrumbs still give ~90% of
  // the debug value without the privacy footgun. Flip to `true` if you're
  // running your own Sentry project and have a lawful basis for the data.
  sendDefaultPii: false,
  tracesSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  replaysOnErrorSampleRate: clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE,
  integrations: [
    // Browser tracing: instruments page navigations, fetch/XHR, and Web
    // Vitals (LCP, CLS, INP). Already in the default integration set for
    // @sentry/nextjs but listed explicitly so the intent is visible.
    Sentry.browserTracingIntegration(),
    // Session replay: records DOM + pointer/keyboard events so crashes can
    // be reproduced visually. Gated by the two replay sampling rates.
    Sentry.replayIntegration(),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
