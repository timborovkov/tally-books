/**
 * Server runtime (Node.js) Sentry bootstrap.
 * Loaded from `src/instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`.
 */
import * as Sentry from "@sentry/nextjs";

import { env } from "@/lib/env";

const dsn = env.SENTRY_DSN ?? "";

Sentry.init({
  dsn,
  enabled: dsn !== "",
  sendDefaultPii: true,
  tracesSampleRate: env.NODE_ENV === "development" ? 1.0 : 0.1,
});
