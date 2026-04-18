import { z } from "zod";

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
  })
  .partial();

export const createEntityInput = z.object({
  kind: z.enum(["legal", "personal"]),
  name: z.string().min(1).max(200),
  entityType: z.string().min(1).max(40).nullable().optional(),
  jurisdictionId: z.string().min(1),
  businessId: z.string().nullable().optional(),
  vatRegistered: z.boolean().default(false),
  vatNumber: z.string().nullable().optional(),
  address: addressSchema.default({}),
  financialYearStartMonth: z.number().int().min(1).max(12),
  // ISO 4217. Three-letter alpha code, uppercase.
  baseCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, "must be a 3-letter ISO 4217 code"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateEntityInput = z.input<typeof createEntityInput>;

export const updateEntityInput = createEntityInput
  .partial()
  .omit({ kind: true })
  .extend({ id: z.string().min(1) });

export type UpdateEntityInput = z.input<typeof updateEntityInput>;

export const linkPersonInput = z.object({
  entityId: z.string().min(1),
  personId: z.string().min(1),
  role: z.string().min(1).max(40),
  // 0.0000 – 100.0000. numeric(7,4). Stored as string in pg-driver but
  // we accept numbers and serialise. `.finite()` rejects NaN and ±Infinity
  // so a bad `Number.parseFloat()` in a server action fails here with a
  // typed validation error instead of reaching Postgres and producing
  // an opaque driver error.
  sharePercent: z.number().finite().min(0).max(100).nullable().optional(),
  validFrom: z.date().optional(),
  validTo: z.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type LinkPersonInput = z.input<typeof linkPersonInput>;
