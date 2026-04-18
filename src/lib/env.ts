import { z } from "zod";

/**
 * Server-only environment schema.
 *
 * Runs in Node/edge runtimes only. Importing this module from a browser
 * entrypoint would fail (DATABASE_URL etc. aren't inlined into the client
 * bundle) — use `@/lib/env.client` from client code instead.
 *
 * Adding a new server env var:
 *   1. Add it here with a zod validator (and a `.default(...)` if it's
 *      optional in dev).
 *   2. Add it to `.env.example` with a sensible placeholder.
 *   3. Read it via `import { env } from "@/lib/env"` — never via
 *      `process.env.X` directly. That way startup fails fast on missing
 *      or malformed config instead of crashing on first use.
 *
 * Browser-accessible `NEXT_PUBLIC_*` vars live in `@/lib/env.client`.
 */

// Sampling-rate coercer: accepts empty string / undefined → `def`, otherwise
// parses a number in [0, 1]. Sentry rejects out-of-range values at runtime,
// so catch bad config at boot instead.
const sampleRate = (def: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().min(0).max(1));

// Empty strings in `.env` (e.g. `SENTRY_ORG=`) must normalize to `undefined`,
// not `""`. Otherwise `env.SENTRY_ENVIRONMENT ?? env.NODE_ENV` would pass an
// empty string through, and `sentryUrl: process.env.SENTRY_URL || undefined`
// style coalescing would diverge from the validated value.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v));

const optionalUrl = optionalString.pipe(z.string().url().optional());

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@tally.local"),
  // ── Sentry runtime (server + edge) ────────────────────────────────────
  // DSN lives in `NEXT_PUBLIC_SENTRY_DSN` (see env.client.ts) — a single DSN
  // powers all three runtimes. The DSN is not a secret (it ships in every
  // browser bundle), so there's no reason to duplicate it as a server var.
  //
  // Every Sentry var below is optional: the SDK must start cleanly with an
  // empty `.env`. Zod applies defaults (sampling rates) or normalizes empty
  // strings to `undefined` (tags, slugs, URLs) so downstream `??` fallbacks
  // work. The master toggle (client-side) gates the whole thing.
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: sampleRate(0.1),
  SENTRY_PROFILES_SAMPLE_RATE: sampleRate(0.1),
  // ── Sentry build-time (source-map upload; all optional) ───────────────
  // `SENTRY_AUTH_TOKEN` alone gates upload — leave blank to skip entirely.
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,
  SENTRY_AUTH_TOKEN: optionalString,
  // Default `https://sentry.io/`; override for self-hosted / EU / private-cloud.
  SENTRY_URL: optionalUrl,
});

export type Env = z.infer<typeof serverSchema>;

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env: Env = parsed.data;
