import { z } from "zod";

import { jurisdictionConfigSchema } from "@/lib/jurisdictions/types";

export const createJurisdictionInput = z.object({
  // ISO-style code, uppercase, optional region suffix (`EE`, `US-DE`).
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z]{2,3}(-[A-Z0-9]{1,4})?$/, "must look like 'EE' or 'US-DE'"),
  name: z.string().min(1).max(120),
  config: jurisdictionConfigSchema,
  freeformContextMd: z.string().nullable().optional(),
});

export type CreateJurisdictionInput = z.input<typeof createJurisdictionInput>;

export const updateJurisdictionInput = createJurisdictionInput.partial().extend({
  id: z.string().min(1),
});

export type UpdateJurisdictionInput = z.input<typeof updateJurisdictionInput>;
