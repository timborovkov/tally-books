import { z } from "zod";

/**
 * Structured-output schema for receipt OCR / vision extraction.
 *
 * Each domain field is wrapped in `{ value, confidence }` so the UI
 * can paint low-confidence fields in a distinct color (the v0.2
 * "confidence highlighting in UI for low-confidence fields" bullet).
 * Confidences are floats in [0, 1]. Providers that can't produce a
 * meaningful confidence should return `1.0` for fields they are
 * certain about (e.g. a human-typed value) and `0.0` for fields
 * they left blank — the UI uses both endpoints.
 *
 * `taxLines` is optional because many receipts don't itemise VAT
 * (card slips, cash receipts). When present, it's an array so
 * multi-rate receipts (mix of 14% / 25.5% under FI VAT) round-trip.
 *
 * `categoryHint` is free text the model suggests — it's NOT one of
 * our category IDs. The user confirms or overrides in the review
 * step. Receipt-categorizer agent in v0.6 will map hints onto real
 * categories with RAG-grounded context.
 */

const confidence = z.number().min(0).max(1);

// Helper so every field shares one wrapper definition. Using a factory
// keeps each field's inner schema narrow (string vs decimal-string etc.)
// while ensuring the confidence-and-value shape is identical everywhere.
function fieldOf<T extends z.ZodTypeAny>(inner: T) {
  return z.object({
    value: inner.nullable(),
    confidence,
  });
}

// Accept the same decimal-string shape the receipts domain uses. The
// vision model produces strings ("9.99"); we keep it as a string so
// there's no lossy number round-trip before the numeric(20,4) write.
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "must be a decimal with up to 4 fractional digits");

const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "must parse as an ISO 8601 date",
});

const currency = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code");

export const receiptExtraction = z.object({
  vendor: fieldOf(z.string().min(1).max(200)),
  occurredAt: fieldOf(isoDateString),
  amount: fieldOf(decimalString),
  currency: fieldOf(currency),
  /**
   * Itemised VAT lines where visible on the receipt. Empty array =
   * model saw a receipt with no VAT breakdown (fine). Null = model
   * chose to skip (rare; treat as empty).
   */
  taxLines: z
    .array(
      z.object({
        rate: z.string().max(20),
        base: decimalString,
        tax: decimalString,
        confidence,
      }),
    )
    .nullable(),
  /** Free text — user confirms / overrides during review. */
  categoryHint: z.string().max(200).nullable(),
  /** Model's aside about the receipt as a whole. */
  notes: z.string().max(1000).nullable(),
  /**
   * Overall quality gauge (typically `min(field.confidence)` or a
   * provider-computed score). Drives the inbox's "needs review"
   * sort order so the shakiest extractions bubble to the top.
   */
  overallConfidence: confidence,
});

export type ReceiptExtraction = z.infer<typeof receiptExtraction>;
