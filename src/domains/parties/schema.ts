import { z } from "zod";

const partyKind = z.enum(["client", "supplier", "contractor", "employee"]);

const contactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().min(2).max(3).optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

// Tax IDs are an open record — VAT, EIN, business id etc. Validation
// per-jurisdiction is not done here (same convention as persons.ids).
const taxIdsSchema = z.record(z.string(), z.string());

// Default invoicing terms — payment days, payment method preferences,
// default currency override. Free shape; the invoice composer reads
// what it knows and ignores the rest.
const defaultTermsSchema = z.record(z.string(), z.unknown());

export const createPartyInput = z.object({
  kind: partyKind,
  name: z.string().min(1).max(200),
  legalEntityId: z.string().min(1).max(120).nullable().optional(),
  contact: contactSchema.default({}),
  taxIds: taxIdsSchema.default({}),
  defaultTerms: defaultTermsSchema.default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreatePartyInput = z.input<typeof createPartyInput>;

/**
 * Partial update — fields not supplied stay untouched. We rebuild the
 * schema from scratch (rather than `createPartyInput.partial()`) so the
 * `.default({})` factories on contact/taxIds/etc. don't fire on omission
 * and silently clobber existing jsonb columns with `{}`.
 */
export const updatePartyInput = z.object({
  id: z.string().min(1),
  kind: partyKind.optional(),
  name: z.string().min(1).max(200).optional(),
  legalEntityId: z.string().min(1).max(120).nullable().optional(),
  contact: contactSchema.optional(),
  taxIds: taxIdsSchema.optional(),
  defaultTerms: defaultTermsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdatePartyInput = z.input<typeof updatePartyInput>;

export const archivePartyInput = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
});

export type ArchivePartyInput = z.input<typeof archivePartyInput>;
