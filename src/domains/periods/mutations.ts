import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { entities, financialPeriods, type FinancialPeriod } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { ConflictError, NotFoundError, ValidationError } from "../errors";

import {
  createPeriodInput,
  lockPeriodInput,
  unlockPeriodInput,
  type CreatePeriodInput,
  type LockPeriodInput,
  type UnlockPeriodInput,
} from "./schema";

export async function createPeriod(
  db: Db,
  actor: CurrentActor,
  raw: CreatePeriodInput,
): Promise<FinancialPeriod> {
  const input = createPeriodInput.parse(raw);
  // Period lifecycle is a filing-adjacent concern; `filings` scoped by
  // entity is the closest fit in the IAM resource enum.
  await assertCan(actor.user, "filings", "write", { entityId: input.entityId });

  if (input.endAt <= input.startAt) {
    throw new ValidationError("endAt must be after startAt", {
      field: "endAt",
      startAt: input.startAt,
      endAt: input.endAt,
    });
  }

  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.id, input.entityId))
    .limit(1);
  if (!entity) {
    throw new ValidationError(`Unknown entity: ${input.entityId}`, { field: "entityId" });
  }

  const [row] = await db
    .insert(financialPeriods)
    .values({
      entityId: input.entityId,
      kind: input.kind,
      label: input.label,
      startAt: input.startAt,
      endAt: input.endAt,
    })
    .returning();
  if (!row) throw new Error("financial_periods insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "period.created",
    payload: { periodId: row.id, entityId: row.entityId, label: row.label },
  });

  return row;
}

export async function lockPeriod(
  db: Db,
  actor: CurrentActor,
  raw: LockPeriodInput,
): Promise<FinancialPeriod> {
  const input = lockPeriodInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.id, input.periodId))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("financial_period", input.periodId);
    await assertCan(actor.user, "filings", "write", { entityId: existing.entityId });
    if (existing.locked) {
      throw new ConflictError("Period is already locked", {
        periodId: existing.id,
        lockedAt: existing.lockedAt,
      });
    }

    const [row] = await tx
      .update(financialPeriods)
      .set({
        locked: true,
        lockedAt: new Date(),
        lockedBy: actor.userId,
        lockReason: input.reason,
      })
      .where(eq(financialPeriods.id, input.periodId))
      .returning();
    if (!row) throw new Error("financial_periods update returned no row");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "period.locked",
      payload: {
        periodId: row.id,
        entityId: row.entityId,
        label: row.label,
        reason: input.reason,
      },
    });

    return row;
  });
}

export async function unlockPeriod(
  db: Db,
  actor: CurrentActor,
  raw: UnlockPeriodInput,
): Promise<FinancialPeriod> {
  const input = unlockPeriodInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.id, input.periodId))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("financial_period", input.periodId);
    await assertCan(actor.user, "filings", "write", { entityId: existing.entityId });
    if (!existing.locked) {
      throw new ConflictError("Period is not locked", { periodId: existing.id });
    }

    const [row] = await tx
      .update(financialPeriods)
      .set({
        locked: false,
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
      })
      .where(eq(financialPeriods.id, input.periodId))
      .returning();
    if (!row) throw new Error("financial_periods update returned no row");

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: "period.unlocked",
      payload: {
        periodId: row.id,
        entityId: row.entityId,
        label: row.label,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    return row;
  });
}
