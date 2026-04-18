import { z } from "zod";

import { booleanFlag, optionalString, optionalUrl, sampleRate } from "@/lib/env.shared";

/**
 * Client-safe environment schema.
 *
 * Only `NEXT_PUBLIC_*` vars live here — Next.js inlines them into the
 * browser bundle at build time. Import this from any runtime (browser,
 * server, edge).
 *
 * Adding a new client env var:
 *   1. Add it to the schema below with a zod validator.
 *   2. Add it to the explicit destructure below so Next.js inlines it
 *      into the browser bundle. (Iterating `process.env` doesn't work in
 *      the browser — only literal `process.env.NEXT_PUBLIC_FOO` references
 *      are replaced at build time.)
 *   3. Add it to `.env.example` with a sensible placeholder.
 *   4. Read it via `import { clientEnv } from "@/lib/env.client"`.
 *
 * Zod helpers shared with `@/lib/env` live in `@/lib/env.shared`.
 */

const clientSchema = z.object({
  // Master toggle. Only the literal string "true" (whitespace-trimmed)
  // enables Sentry; anything else (including unset) keeps the SDK inert
  // even when a DSN is present. This is the "flip to true to test against
  // Sentry" knob — see docs/architecture/sentry.md.
  NEXT_PUBLIC_SENTRY_ENABLED: booleanFlag,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  // Deploy tag shown in the Sentry dashboard. Lives here (not in the
  // server schema) so the browser SDK can tag events with the same
  // environment as the server — otherwise staging client events would
  // show up under "production" (the browser's NODE_ENV fallback) while
  // server events correctly say "staging", splitting the same deployment
  // across two environments. Falls back to NODE_ENV at read time.
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: optionalString,
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: sampleRate(0.15),
  NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: sampleRate(0.1),
  NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE: sampleRate(1.0),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// Explicit destructure — see comment above.
const parsed = clientSchema.safeParse({
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE,
});

if (!parsed.success) {
  console.error("❌ Invalid client environment variables:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const clientEnv: ClientEnv = parsed.data;
