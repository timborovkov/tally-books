import { and, eq, gt, lte } from "drizzle-orm";

import type { Db } from "@/db/client";
import { financialPeriods } from "@/db/schema";

import { PeriodLockedError } from "./errors";

/**
 * Rejects the mutation if `occurredAt` falls inside any locked
 * `financial_periods` row for the entity. Call at the top of any
 * versioned-Thing mutation on a Thing with an economic date
 * (receipts.occurred_at, invoices.issue_date, …).
 *
 * **Interval convention: half-open `[startAt, endAt)`.** `startAt` is
 * inclusive, `endAt` is exclusive — a "FY2025" row spans
 * `2025-01-01T00:00:00Z` (inclusive) through `2026-01-01T00:00:00Z`
 * (exclusive). This is the Postgres `tstzrange`/BI-tool standard and
 * avoids sub-microsecond boundary games at period ends (with a closed
 * `[start, end]` interval and `endAt = 23:59:59Z`, anything in the last
 * 999 ms of Dec 31 would slip through). Users still label the period
 * as "FY2025"; only the internal endAt representation is half-open.
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
        gt(financialPeriods.endAt, opts.occurredAt),
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
