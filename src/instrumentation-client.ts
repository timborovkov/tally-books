/**
 * Browser-side Sentry bootstrap. Next.js loads this automatically when
 * `src/instrumentation-client.ts` is present (same convention as the server
 * `instrumentation.ts`).
 *
 * DSN is read from `NEXT_PUBLIC_SENTRY_DSN`. Leave it blank (in `.env` or
 * the deploy environment) to disable — the SDK still initialises but with
 * an empty DSN it never sends events. See `docs/architecture/sentry.md`.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

Sentry.init({
  dsn,
  enabled: dsn !== "",
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
