import { z } from "zod";

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
 */

const optionalSentryDsn = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v))
  .pipe(z.string().url().optional());

const sampleRate = (def: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().min(0).max(1));

const clientSchema = z.object({
  // Master toggle. Only the literal string "true" enables Sentry; anything
  // else (including unset) keeps the SDK inert even when a DSN is present.
  // This is the "flip to true to test against Sentry" knob — see
  // docs/architecture/sentry.md.
  NEXT_PUBLIC_SENTRY_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  NEXT_PUBLIC_SENTRY_DSN: optionalSentryDsn,
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: sampleRate(0.15),
  NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: sampleRate(0.1),
  NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE: sampleRate(1.0),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// Explicit destructure — see comment above.
const parsed = clientSchema.safeParse({
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
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
