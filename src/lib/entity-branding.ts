import { z } from "zod";

/**
 * Branding configuration stored under `entities.metadata.branding`.
 *
 * Lives in the entity's metadata jsonb (no schema migration) so adding
 * fields is a code change, not a database change. The Zod schema below
 * is the source of truth for what's recognised; unknown keys are
 * preserved on write but ignored on read.
 *
 * Used by the invoice PDF renderer (`logoBlobId`, `bankAccount`,
 * `footer`) and by the invoice number assigner (`invoicePrefix`).
 */
export const entityBrandingSchema = z.object({
  invoicePrefix: z.string().min(1).max(20).optional(),
  logoBlobId: z.string().min(1).optional(),
  bankAccount: z
    .object({
      iban: z.string().min(1).max(34).optional(),
      bic: z.string().min(1).max(11).optional(),
      bankName: z.string().min(1).max(120).optional(),
      accountHolder: z.string().min(1).max(120).optional(),
    })
    .optional(),
  footer: z.string().max(500).optional(),
});

export type EntityBranding = z.infer<typeof entityBrandingSchema>;

/**
 * Read branding from a raw `entities.metadata` jsonb value. Returns an
 * empty object when no `branding` key is present so callers can
 * destructure without null checks.
 */
export function readEntityBranding(metadata: unknown): EntityBranding {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = (metadata as { branding?: unknown }).branding;
  if (!raw) return {};
  const parsed = entityBrandingSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

