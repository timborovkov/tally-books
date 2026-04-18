import { z } from "zod";

const addressSchema = z.object({
  label: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().min(2).max(3),
});

const contactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const createPersonInput = z.object({
  legalName: z.string().min(1).max(200),
  taxResidency: z.string().min(2).max(10).nullable().optional(),
  // Open record: keys like `henkilotunnus`, `isikukood`, `NIE`, `SSN`,
  // values are the ID string. Validation is per-jurisdiction and lives
  // outside this schema for now.
  ids: z.record(z.string(), z.string()).default({}),
  addresses: z.array(addressSchema).default([]),
  contact: contactSchema.default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  userId: z.string().nullable().optional(),
});

// Use z.input so callers can omit fields that have Zod defaults — the
// service layer parses with Zod and the defaults fill in.
export type CreatePersonInput = z.input<typeof createPersonInput>;

export const updatePersonInput = createPersonInput.partial().extend({
  id: z.string().min(1),
});

export type UpdatePersonInput = z.input<typeof updatePersonInput>;
