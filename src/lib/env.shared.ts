import { z } from "zod";

/**
 * Zod helpers shared by both env schemas (`@/lib/env` server + edge,
 * `@/lib/env.client` browser). No server-only deps so this module is safe
 * to import from any runtime.
 *
 * Rules for adding helpers here:
 *   - Must be pure zod — no reads of `process.env`, no side effects.
 *   - Must `.trim()` inputs before comparing. Trailing whitespace from `.env`
 *     (e.g. `FOO=bar ` or a stray CR on Windows) would otherwise silently
 *     change behavior — a class of bug that's painful to diagnose.
 */

/**
 * Accepts `undefined`, `""`, or a non-empty string. Empty / missing → `undefined`.
 * Use for optional string env vars so `value ?? fallback` behaves.
 */
export const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v));

/**
 * Like `optionalString`, but also validates the value is a URL.
 */
export const optionalUrl = optionalString.pipe(z.string().url().optional());

/**
 * Coerces a string env var to a sample rate in `[0, 1]`. Empty / missing
 * yields the provided default. Out-of-range values fail validation at boot.
 */
export const sampleRate = (def: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().min(0).max(1));

/**
 * Boolean toggle parsed from a string env var. Trims first so a stray space
 * after `true` in `.env` doesn't silently flip the result to `false`. Only
 * the literal (trimmed) string `"true"` enables; everything else → `false`.
 */
export const booleanFlag = z
  .string()
  .trim()
  .optional()
  .transform((v) => v === "true");
