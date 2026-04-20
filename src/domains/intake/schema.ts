import { z } from "zod";

/**
 * Zod input shapes for intake mutations. Keep these narrow —
 * each field is a deliberate part of the intake API surface, and
 * sloppy types here propagate into the server action / inbox UI
 * contract.
 */

export const intakeRoutingInput = z
  .object({
    isPersonal: z.boolean().nullable(),
    entityId: z.string().min(1).nullable(),
    targetFlow: z.enum([
      "expense",
      "trip",
      "mileage",
      "benefit",
      "compliance_evidence",
    ]),
  })
  .refine(
    // A business-route must name an entity; a personal route must NOT.
    // The inbox UI enforces this already, but the domain layer is the
    // source of truth — a bulk-action payload that leaks through with
    // both set would silently attach the item to an entity we didn't
    // intend.
    (v) => (v.isPersonal === true ? v.entityId === null : v.entityId !== null),
    { message: "personal routing must not have entityId; business routing must have entityId" },
  );

export const routeIntakeInput = z
  .object({
    id: z.string().min(1),
  })
  .and(intakeRoutingInput);

export type RouteIntakeInput = z.infer<typeof routeIntakeInput>;

// Confirm payload. Caller may supply the final domain fields to use
// for the downstream artifact (overriding whatever the user edited
// on top of the OCR extraction). Sparse — unspecified fields are
// taken from the current extraction.
export const confirmIntakeInput = z
  .object({
    id: z.string().min(1),
    // Receipt-target fields. Other target flows add their own slot
    // as the domains land.
    receipt: z
      .object({
        occurredAt: z.date().optional(),
        vendor: z.string().min(1).max(200).optional(),
        amount: z
          .union([
            z.number().finite(),
            z
              .string()
              .regex(
                /^-?\d+(\.\d{1,4})?$/,
                "must be a decimal with up to 4 fractional digits",
              ),
          ])
          .optional(),
        currency: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .optional(),
  });

export type ConfirmIntakeInput = z.infer<typeof confirmIntakeInput>;

export const rejectIntakeInput = z.object({
  id: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type RejectIntakeInput = z.infer<typeof rejectIntakeInput>;
