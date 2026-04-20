import { and, eq, lte, gte } from "drizzle-orm";

import type { Db } from "@/db/client";
import { financialPeriods } from "@/db/schema";

import { PeriodLockedError } from "./errors";

/**
 * Rejects the mutation if `occurredAt` falls inside any locked
 * `financial_periods` row for the entity. Call at the top of any
 * versioned-Thing mutation on a Thing with an economic date
 * (receipts.occurred_at, invoices.issue_date, …).
 *
 * Uses inclusive bounds on both sides — a period covers
 * `[startAt, endAt]` — matching how humans talk about "FY2024" including
 * its last day. If we discover the product wants half-open intervals we
 * migrate the comparison here.
 */
export async function assertPeriodUnlocked(
  db: Db,
  opts: { entityId: string; occurredAt: Date },
): Promise<void> {
  const [lock] = await db
    .select({
      id: financialPeriods.id,
      lockedAt: financialPeriods.lockedAt,
      lockReason: financialPeriods.lockReason,
    })
    .from(financialPeriods)
    .where(
      and(
        eq(financialPeriods.entityId, opts.entityId),
        eq(financialPeriods.locked, true),
        lte(financialPeriods.startAt, opts.occurredAt),
        gte(financialPeriods.endAt, opts.occurredAt),
      ),
    )
    .limit(1);

  if (lock) {
    throw new PeriodLockedError({
      periodId: lock.id,
      entityId: opts.entityId,
      occurredAt: opts.occurredAt,
      lockedAt: lock.lockedAt,
      lockReason: lock.lockReason,
    });
  }
}
