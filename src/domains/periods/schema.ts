import { z } from "zod";

export const createPeriodInput = z.object({
  entityId: z.string().min(1),
  kind: z.enum(["month", "quarter", "year", "custom"]),
  label: z.string().min(1).max(100),
  startAt: z.date(),
  endAt: z.date(),
});

export type CreatePeriodInput = z.input<typeof createPeriodInput>;

export const lockPeriodInput = z.object({
  periodId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type LockPeriodInput = z.input<typeof lockPeriodInput>;

export const unlockPeriodInput = z.object({
  periodId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export type UnlockPeriodInput = z.input<typeof unlockPeriodInput>;
