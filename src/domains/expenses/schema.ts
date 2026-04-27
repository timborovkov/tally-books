import { z } from "zod";

// Mirrors receipts/schema.ts. numeric(20,4) round-trips as a string;
// emit the canonical 4-decimal form so version snapshots match what
// Postgres returns and createPatch doesn't see a spurious diff.
const amountInput = z
  .union([
    z.number().finite(),
    z.string().regex(/^-?\d+(\.\d{1,4})?$/, "must be a decimal with up to 4 fractional digits"),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)).toFixed(4));

const optionalAmount = amountInput.nullable().optional();

const currencyInput = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code");

// numeric(6,4) — VAT rate stored as decimal (0.24 = 24%). Up to 4 dp.
// Form inputs arrive as strings; the range check sits AFTER the
// number coercion so both string ("24" → 24, rejected) and number
// branches go through the same 0..1 gate. Without this, "24" would
// have stored as "24.0000" → 2400% VAT (cursor caught this).
const vatRateInput = z
  .union([
    z.number().finite(),
    z.string().regex(/^\d+(\.\d{1,4})?$/, "must be a decimal with up to 4 fractional digits"),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .refine((n) => n >= 0 && n <= 1, "must be between 0 and 1 (e.g. 0.24 = 24%)")
  .transform((n) => n.toFixed(4));

const paidByInput = z.enum(["entity", "personal_reimbursable", "personal_no_reimburse"]);

export const createExpenseInput = z.object({
  entityId: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  occurredAt: z.date(),
  amount: amountInput,
  currency: currencyInput,
  vatAmount: optionalAmount,
  vatRate: vatRateInput.nullable().optional(),
  vatDeductible: z.boolean().optional(),
  paidBy: paidByInput.optional(),
  linkedReceiptId: z.string().min(1).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

export type CreateExpenseInput = z.input<typeof createExpenseInput>;

export const updateExpenseInput = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  vendor: z.string().max(200).nullable().optional(),
  occurredAt: z.date().optional(),
  amount: amountInput.optional(),
  currency: currencyInput.optional(),
  vatAmount: optionalAmount,
  vatRate: vatRateInput.nullable().optional(),
  vatDeductible: z.boolean().optional(),
  paidBy: paidByInput.optional(),
  description: z.string().max(2000).nullable().optional(),
  reason: z.string().max(500).optional(),
  // See receipts/schema.ts — optimistic concurrency guard.
  expectedVersionNum: z.number().int().min(1).optional(),
});

export type UpdateExpenseInput = z.input<typeof updateExpenseInput>;

export const transitionExpenseInput = z.object({
  id: z.string().min(1),
  nextState: z.enum(["draft", "ready", "sent", "filed", "amending", "void"]),
  reason: z.string().max(500).optional(),
  filedRef: z.string().max(200).optional(),
});

export type TransitionExpenseInput = z.input<typeof transitionExpenseInput>;

export const linkReceiptInput = z.object({
  expenseId: z.string().min(1),
  // null clears the link.
  receiptId: z.string().min(1).nullable(),
  reason: z.string().max(500).optional(),
});

export type LinkReceiptInput = z.input<typeof linkReceiptInput>;

export const markReimbursedInput = z.object({
  id: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export type MarkReimbursedInput = z.input<typeof markReimbursedInput>;
