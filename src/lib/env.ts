import { z } from "zod";

import { optionalString, optionalUrl, sampleRate } from "@/lib/env.shared";

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
 * Zod helpers shared between the two live in `@/lib/env.shared`.
 */

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
  // ── Sentry runtime (server + edge) ────────────────────────────────────
  // DSN lives in `NEXT_PUBLIC_SENTRY_DSN` (see env.client.ts) — a single DSN
  // powers all three runtimes. The DSN is not a secret (it ships in every
  // browser bundle), so there's no reason to duplicate it as a server var.
  //
  // Every Sentry var below is optional: the SDK must start cleanly with an
  // empty `.env`. Zod applies defaults (sampling rates) or normalizes empty
  // strings to `undefined` (slugs, URLs) so downstream `??` fallbacks work.
  // The master toggle (client-side) gates the whole thing. Environment tag
  // lives in `NEXT_PUBLIC_SENTRY_ENVIRONMENT` so client + server agree.
  SENTRY_TRACES_SAMPLE_RATE: sampleRate(0.1),
  SENTRY_PROFILES_SAMPLE_RATE: sampleRate(0.1),
  // ── Sentry build-time (source-map upload; all optional) ───────────────
  // `SENTRY_AUTH_TOKEN` alone gates upload — leave blank to skip entirely.
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,
  SENTRY_AUTH_TOKEN: optionalString,
  // Default `https://sentry.io/`; override for self-hosted / EU / private-cloud.
  SENTRY_URL: optionalUrl,

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

  // ── S3-compatible blob storage (RustFS in dev/self-host) ──────────────
  // Connection vars for the AWS SDK v3 S3 client. `S3_ENDPOINT` is a full
  // URL (http[s]://host:port) so one var captures host + port + TLS mode.
  // `S3_REGION` is required by the SDK signature flow but its value is
  // not validated by self-hosted backends — any string works; we default
  // to `us-east-1` to match RustFS docs. `S3_FORCE_PATH_STYLE` defaults
  // to true because RustFS (and most self-hosted S3 implementations)
  // expect path-style URLs (`/<bucket>/<key>`); flip to false only when
  // pointing at AWS S3 itself or another vhost-style provider.
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("tally"),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default("tally-dev-secret"),
  // Default true so a fresh `.env` against RustFS works without setting
  // this. Set to "false" only when pointing at AWS S3 / a vhost-style host.
  S3_FORCE_PATH_STYLE: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? true : v === "true")),

  // ── OpenAI (vision OCR for receipt intake) ───────────────────────────
  // Optional everywhere so the app boots without a key (dev + CI). OCR
  // jobs fail fast with a clear ocrError when the key is absent, which
  // is surfaced in the intake UI. Provide a real key in production /
  // any environment where you want extraction to actually run.
  OPENAI_API_KEY: optionalString,
  // Vision-capable model. Left overridable so we can bump without a deploy.
  // 2024-08-06 + later support structured outputs / response_format with
  // json_schema; we default to the current recommended model.
  OPENAI_VISION_MODEL: z.string().trim().default("gpt-4o-2024-08-06"),
});

export type Env = z.infer<typeof serverSchema>;

const parsed = serverSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

export const env: Env = parsed.data;
