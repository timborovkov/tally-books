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

const isProd = process.env.NODE_ENV === "production";

// Placeholders are usable in dev/test so CI and local runs don't need a
// real secret; production rejects them so a missed env var fails fast at
// boot instead of silently signing sessions with a known value or sending
// invites with a fake API key.
const BETTER_AUTH_SECRET_DEV_PLACEHOLDER = "dev-only-secret-do-not-use-in-prod-0123456789";
const RESEND_API_KEY_DEV_PLACEHOLDER = "re_test_placeholder_key";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@tally.local"),

  // ── Sentry (all optional; empty = disabled) ────────────────────────────
  SENTRY_DSN: optionalSentryDsn,
  SENTRY_ORG: z.string().trim().optional(),
  SENTRY_PROJECT: z.string().trim().optional(),
  SENTRY_AUTH_TOKEN: z.string().trim().optional(),

  // ── Auth (BetterAuth) ─────────────────────────────────────────────────
  // Signs session cookies and internal tokens. Must be ≥32 chars and must
  // NOT be the dev placeholder in production.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default(BETTER_AUTH_SECRET_DEV_PLACEHOLDER)
    .refine(
      (v) => !isProd || v !== BETTER_AUTH_SECRET_DEV_PLACEHOLDER,
      "BETTER_AUTH_SECRET must be set to a unique value in production — the dev placeholder is not allowed.",
    ),
  // Public URL of the app. Used by BetterAuth for trusted origins and by
  // the mailer to construct invite links.
  APP_URL: z.string().url().default("http://localhost:3000"),

  // ── Email (Resend) ────────────────────────────────────────────────────
  // Required everywhere — v0.1 has no console-mail fallback. Tests that
  // need to assert on sends should vi.mock("@/lib/email/mailer"). Production
  // rejects the placeholder so a missing key fails startup, not the first
  // invite send.
  RESEND_API_KEY: z
    .string()
    .min(1)
    .default(RESEND_API_KEY_DEV_PLACEHOLDER)
    .refine(
      (v) => !isProd || v !== RESEND_API_KEY_DEV_PLACEHOLDER,
      "RESEND_API_KEY must be set to a real key in production — the dev placeholder is not allowed.",
    ),
  RESEND_FROM_EMAIL: z.string().email().default("noreply@tally.local"),
});

export type Env = z.infer<typeof serverSchema>;

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env: Env = parsed.data;
