import { z } from "zod";

/**
 * One line on an invoice. Stored inside `invoices.line_items` jsonb.
 *
 * Numeric fields ride as strings to preserve decimal precision through
 * Postgres `numeric` round-trips, matching expenses. The composer UI
 * normalises user-typed numbers to fixed-precision strings on save.
 *
 * `vatRate` is the 0–1 ratio (`'0.2400'` = 24%), the same convention
 * used everywhere else in the codebase. `unit` is free text for now —
 * the e-invoice integration in v0.4 may tighten this against UN/CEFACT
 * unit codes.
 */
export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.string().regex(/^\d+(\.\d+)?$/, "quantity must be a non-negative decimal"),
  unitPrice: z.string().regex(/^-?\d+(\.\d+)?$/, "unitPrice must be a decimal"),
  unit: z.string().max(40).optional(),
  vatRate: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "vatRate must be a non-negative decimal")
    .optional(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

// Hard cap on lines per invoice. The PDF renderer buffers the whole
// document in memory and base64-encodes it for the client, so an
// unbounded array is a DoS path under crafted input. 500 is well above
// any plausible real invoice (the largest catering / services invoices
// hit ~100 lines).
const MAX_LINE_ITEMS = 500;
const lineItemsArray = z.array(invoiceLineItemSchema).max(MAX_LINE_ITEMS);

const currency = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);

const deliveryMethod = z.enum(["e_invoice", "pdf", "email", "manual"]);

export const createInvoiceInput = z.object({
  entityId: z.string().min(1),
  clientId: z.string().min(1).nullable().optional(),
  number: z.string().min(1).max(60).nullable().optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  lineItems: lineItemsArray.default([]),
  currency,
  deliveryMethod: deliveryMethod.default("pdf"),
  description: z.string().nullable().optional(),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceInput>;

export const updateInvoiceInput = z.object({
  id: z.string().min(1),
  expectedVersionNum: z.number().int().positive().optional(),
  clientId: z.string().min(1).nullable().optional(),
  number: z.string().min(1).max(60).nullable().optional(),
  issueDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  lineItems: lineItemsArray.optional(),
  currency: currency.optional(),
  deliveryMethod: deliveryMethod.optional(),
  description: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export type UpdateInvoiceInput = z.input<typeof updateInvoiceInput>;

const thingState = z.enum(["draft", "ready", "sent", "filed", "amending", "void"]);

export const transitionInvoiceInput = z.object({
  id: z.string().min(1),
  nextState: thingState,
  reason: z.string().optional(),
  filedRef: z.string().optional(),
});

export type TransitionInvoiceInput = z.input<typeof transitionInvoiceInput>;

export const markInvoicePaidInput = z.object({
  id: z.string().min(1),
  paidAt: z.coerce.date().optional(),
  paymentRef: z.string().max(120).nullable().optional(),
  reason: z.string().optional(),
});

export type MarkInvoicePaidInput = z.input<typeof markInvoicePaidInput>;

export const markInvoiceUnpaidInput = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
});

export type MarkInvoiceUnpaidInput = z.input<typeof markInvoiceUnpaidInput>;

export const createInternalInvoiceInput = z.object({
  sellerEntityId: z.string().min(1),
  buyerEntityId: z.string().min(1),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  currency,
  lineItems: lineItemsArray.min(1),
  deliveryMethod: deliveryMethod.default("manual"),
  description: z.string().nullable().optional(),
});

export type CreateInternalInvoiceInput = z.input<typeof createInternalInvoiceInput>;

/**
 * Sum lines into `subtotal`, `vatTotal`, `total`, all returned as
 * fixed-precision decimal strings to round-trip through Postgres
 * `numeric`. Caller passes line items already validated by
 * `invoiceLineItemSchema`.
 */
export function computeInvoiceTotals(items: InvoiceLineItem[]): {
  subtotal: string;
  vatTotal: string;
  total: string;
} {
  // Light-weight decimal sum without bringing in a big-decimal lib —
  // `numeric` precision (4 places) is plenty for human-entered prices.
  // Worst case the FX recalc worker re-derives from line items.
  let subtotal = 0;
  let vat = 0;
  for (const item of items) {
    const qty = Number.parseFloat(item.quantity);
    const price = Number.parseFloat(item.unitPrice);
    const rate = item.vatRate ? Number.parseFloat(item.vatRate) : 0;
    const lineSubtotal = qty * price;
    const lineVat = lineSubtotal * rate;
    subtotal += lineSubtotal;
    vat += lineVat;
  }
  const total = subtotal + vat;
  // Validate before returning to keep callers from passing the strings
  // straight into Postgres if NaN crept in.
  for (const n of [subtotal, vat, total]) {
    if (!Number.isFinite(n)) {
      throw new Error("invoice totals: non-finite value, check line items");
    }
  }
  return {
    subtotal: subtotal.toFixed(4),
    vatTotal: vat.toFixed(4),
    total: total.toFixed(4),
  };
}

/**
 * Re-validate the parsed line-items array against the schema. Used by
 * mutations that accept a partial update including `lineItems` — the
 * outer schema parses it, but we want the typed `InvoiceLineItem[]`
 * shape inside totals math.
 */
export function parseLineItems(raw: unknown): InvoiceLineItem[] {
  return lineItemsArray.parse(raw);
}
