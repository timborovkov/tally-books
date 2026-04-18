import { z } from "zod";

/**
 * Server-only environment schema.
 *
 * Adding a new env var:
 *   1. Add it here with a zod validator (and a `.default(...)` if it's
 *      optional in dev).
 *   2. Add it to `.env.example` with a sensible placeholder.
 *   3. Read it via `import { env } from "@/lib/env"` — never via
 *      `process.env.X` directly. That way startup fails fast on missing
 *      or malformed config instead of crashing on first use.
 *
 * Browser-accessible vars must be prefixed `NEXT_PUBLIC_` and live in a
 * separate `clientSchema` (none yet — add when one is needed).
 */

// Sentry DSNs are URLs, but an empty string must be accepted as "disabled"
// so we can ship a single `.env.example` without a real DSN and so local
// dev does not emit events. See docs/architecture/sentry.md.
const optionalSentryDsn = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v))
  .pipe(z.string().url().optional());

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@tally.local"),
  // ── Sentry (all optional; empty = disabled) ────────────────────────────
  SENTRY_DSN: optionalSentryDsn,
  SENTRY_ORG: z.string().trim().optional(),
  SENTRY_PROJECT: z.string().trim().optional(),
  SENTRY_AUTH_TOKEN: z.string().trim().optional(),
});

export type Env = z.infer<typeof serverSchema>;

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env: Env = parsed.data;
