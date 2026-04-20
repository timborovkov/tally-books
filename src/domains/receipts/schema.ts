import { z } from "zod";

// Canonical storage shape is 4-fractional-digit string (numeric(20,4)).
// Accept number or string on the way in, always emit the 4-decimal form so
// snapshots written before the DB round-trip match what Postgres returns.
const amountInput = z
  .union([
    z.number().finite(),
    z.string().regex(/^-?\d+(\.\d{1,4})?$/, "must be a decimal with up to 4 fractional digits"),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)).toFixed(4));

const currencyInput = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code");

export const createReceiptInput = z.object({
  entityId: z.string().min(1),
  occurredAt: z.date(),
  vendor: z.string().min(1).max(200),
  amount: amountInput,
  currency: currencyInput,
  notes: z.string().max(2000).nullable().optional(),
  /**
   * Optional link to the uploaded scan. Carrying the blob id into
   * the first version's snapshot means swapping the scan later
   * (intake re-routing, user-driven replace) produces a diff row
   * exactly like editing any other domain field.
   */
  blobId: z.string().min(1).nullable().optional(),
});

export type CreateReceiptInput = z.input<typeof createReceiptInput>;

export const updateReceiptInput = z.object({
  id: z.string().min(1),
  occurredAt: z.date().optional(),
  vendor: z.string().min(1).max(200).optional(),
  amount: amountInput.optional(),
  currency: currencyInput.optional(),
  notes: z.string().max(2000).nullable().optional(),
  blobId: z.string().min(1).nullable().optional(),
  reason: z.string().max(500).optional(),
  // Optimistic concurrency guard — caller reads a receipt, sees version N,
  // and submits the update with `expectedVersionNum: N`. If another writer
  // bumped it in the meantime, the update is rejected with
  // VersionConflictError instead of silently racing on top of stale data.
  expectedVersionNum: z.number().int().min(1).optional(),
});

export type UpdateReceiptInput = z.input<typeof updateReceiptInput>;

export const transitionReceiptInput = z.object({
  id: z.string().min(1),
  // All six thing_state values are accepted here; `assertTransition` in the
  // mutation rejects the ones the receipt state machine disallows (`sent`
  // is invoice-only today). Kept broad so the action layer and the
  // enum-typed column share one shape.
  nextState: z.enum(["draft", "ready", "sent", "filed", "amending", "void"]),
  reason: z.string().max(500).optional(),
  filedRef: z.string().max(200).optional(),
});

export type TransitionReceiptInput = z.input<typeof transitionReceiptInput>;
