import { count, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { entities, jurisdictions, type Jurisdiction } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { ConflictError, NotFoundError } from "../errors";

import {
  createJurisdictionInput,
  updateJurisdictionInput,
  type CreateJurisdictionInput,
  type UpdateJurisdictionInput,
} from "./schema";

export async function createJurisdiction(
  db: Db,
  actor: CurrentActor,
  raw: CreateJurisdictionInput,
): Promise<Jurisdiction> {
  // Jurisdictions are global config — mutations require an unscoped
  // `business_details` write grant, which only admins hold by default
  // (`can()` short-circuits on `role === 'admin'`).
  await assertCan(actor.user, "business_details", "write");
  const input = createJurisdictionInput.parse(raw);

  const existing = await db
    .select({ id: jurisdictions.id })
    .from(jurisdictions)
    .where(eq(jurisdictions.code, input.code))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Jurisdiction with code ${input.code} already exists`, {
      code: input.code,
    });
  }

  const [row] = await db
    .insert(jurisdictions)
    .values({
      code: input.code,
      name: input.name,
      config: input.config,
      freeformContextMd: input.freeformContextMd ?? null,
    })
    .returning();

  if (!row) throw new Error("jurisdiction insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "jurisdiction.created",
    payload: { jurisdictionId: row.id, code: row.code },
  });

  return row;
}

export async function updateJurisdiction(
  db: Db,
  actor: CurrentActor,
  raw: UpdateJurisdictionInput,
): Promise<Jurisdiction> {
  await assertCan(actor.user, "business_details", "write");
  const input = updateJurisdictionInput.parse(raw);

  const patch: Partial<typeof jurisdictions.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.code !== undefined) patch.code = input.code;
  if (input.name !== undefined) patch.name = input.name;
  if (input.config !== undefined) patch.config = input.config;
  if (input.freeformContextMd !== undefined) patch.freeformContextMd = input.freeformContextMd;

  const [row] = await db
    .update(jurisdictions)
    .set(patch)
    .where(eq(jurisdictions.id, input.id))
    .returning();

  if (!row) throw new NotFoundError("jurisdiction", input.id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "jurisdiction.updated",
    payload: { jurisdictionId: row.id, fields: Object.keys(patch) },
  });

  return row;
}

export async function deleteJurisdiction(db: Db, actor: CurrentActor, id: string): Promise<void> {
  await assertCan(actor.user, "business_details", "write");
  const [usage] = await db
    .select({ n: count() })
    .from(entities)
    .where(eq(entities.jurisdictionId, id));

  if ((usage?.n ?? 0) > 0) {
    throw new ConflictError("Cannot delete a jurisdiction that has entities pointing at it", {
      jurisdictionId: id,
      entityCount: usage?.n ?? 0,
    });
  }

  const result = await db.delete(jurisdictions).where(eq(jurisdictions.id, id)).returning();
  if (result.length === 0) throw new NotFoundError("jurisdiction", id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "jurisdiction.deleted",
    payload: { jurisdictionId: id },
  });
}
