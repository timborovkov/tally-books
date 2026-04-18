import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  entities,
  entityPersonLinks,
  jurisdictions,
  persons,
  type Entity,
  type EntityPersonLink,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";

import { ConflictError, NotFoundError, ValidationError } from "../errors";

import {
  createEntityInput,
  linkPersonInput,
  updateEntityInput,
  type CreateEntityInput,
  type LinkPersonInput,
  type UpdateEntityInput,
} from "./schema";

export async function createEntity(
  db: Db,
  actor: CurrentActor,
  raw: CreateEntityInput,
): Promise<Entity> {
  const input = createEntityInput.parse(raw);

  // Check FK ourselves so the error message is actionable instead of a
  // raw 23503 leaking out.
  const [j] = await db
    .select({ id: jurisdictions.id })
    .from(jurisdictions)
    .where(eq(jurisdictions.id, input.jurisdictionId))
    .limit(1);

  if (!j) {
    throw new ValidationError(`Unknown jurisdiction: ${input.jurisdictionId}`, {
      field: "jurisdictionId",
    });
  }

  const [row] = await db
    .insert(entities)
    .values({
      kind: input.kind,
      name: input.name,
      entityType: input.entityType ?? null,
      jurisdictionId: input.jurisdictionId,
      businessId: input.businessId ?? null,
      vatRegistered: input.vatRegistered,
      vatNumber: input.vatNumber ?? null,
      address: input.address,
      financialYearStartMonth: input.financialYearStartMonth,
      baseCurrency: input.baseCurrency,
      metadata: input.metadata,
    })
    .returning();

  if (!row) throw new Error("entity insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.created",
    payload: { entityId: row.id, kind: row.kind, jurisdictionId: row.jurisdictionId },
  });

  return row;
}

export async function updateEntity(
  db: Db,
  actor: CurrentActor,
  raw: UpdateEntityInput,
): Promise<Entity> {
  const input = updateEntityInput.parse(raw);

  if (input.jurisdictionId !== undefined) {
    const [j] = await db
      .select({ id: jurisdictions.id })
      .from(jurisdictions)
      .where(eq(jurisdictions.id, input.jurisdictionId))
      .limit(1);
    if (!j) {
      throw new ValidationError(`Unknown jurisdiction: ${input.jurisdictionId}`, {
        field: "jurisdictionId",
      });
    }
  }

  const patch: Partial<typeof entities.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) patch.name = input.name;
  if (input.entityType !== undefined) patch.entityType = input.entityType;
  if (input.jurisdictionId !== undefined) patch.jurisdictionId = input.jurisdictionId;
  if (input.businessId !== undefined) patch.businessId = input.businessId;
  if (input.vatRegistered !== undefined) patch.vatRegistered = input.vatRegistered;
  if (input.vatNumber !== undefined) patch.vatNumber = input.vatNumber;
  if (input.address !== undefined) patch.address = input.address;
  if (input.financialYearStartMonth !== undefined)
    patch.financialYearStartMonth = input.financialYearStartMonth;
  if (input.baseCurrency !== undefined) patch.baseCurrency = input.baseCurrency;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const [row] = await db.update(entities).set(patch).where(eq(entities.id, input.id)).returning();
  if (!row) throw new NotFoundError("entity", input.id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.updated",
    payload: { entityId: row.id, fields: Object.keys(patch) },
  });

  return row;
}

export async function archiveEntity(db: Db, actor: CurrentActor, id: string): Promise<Entity> {
  const [row] = await db
    .update(entities)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(entities.id, id))
    .returning();
  if (!row) throw new NotFoundError("entity", id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.archived",
    payload: { entityId: id },
  });
  return row;
}

export async function unarchiveEntity(db: Db, actor: CurrentActor, id: string): Promise<Entity> {
  const [row] = await db
    .update(entities)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(entities.id, id))
    .returning();
  if (!row) throw new NotFoundError("entity", id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.unarchived",
    payload: { entityId: id },
  });
  return row;
}

export async function linkPersonToEntity(
  db: Db,
  actor: CurrentActor,
  raw: LinkPersonInput,
): Promise<EntityPersonLink> {
  const input = linkPersonInput.parse(raw);

  // Validate FKs explicitly (better errors than raw 23503).
  const [e] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.id, input.entityId))
    .limit(1);
  if (!e) throw new ValidationError(`Unknown entity: ${input.entityId}`, { field: "entityId" });

  const [p] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.id, input.personId))
    .limit(1);
  if (!p) throw new ValidationError(`Unknown person: ${input.personId}`, { field: "personId" });

  const [row] = await db
    .insert(entityPersonLinks)
    .values({
      entityId: input.entityId,
      personId: input.personId,
      role: input.role,
      // numeric is serialised by postgres-js as a string.
      sharePercent:
        input.sharePercent === null || input.sharePercent === undefined
          ? null
          : input.sharePercent.toFixed(4),
      validFrom: input.validFrom ?? new Date(),
      validTo: input.validTo ?? null,
      metadata: input.metadata,
    })
    .returning();

  if (!row) throw new Error("entity_person_link insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.person_linked",
    payload: {
      linkId: row.id,
      entityId: row.entityId,
      personId: row.personId,
      role: row.role,
    },
  });

  return row;
}

export async function unlinkPersonFromEntity(
  db: Db,
  actor: CurrentActor,
  linkId: string,
): Promise<EntityPersonLink> {
  // Atomic close: only update rows that are still open. If 0 rows
  // come back, a separate SELECT distinguishes "not found" from
  // "already closed" so the API surface stays unambiguous. This
  // avoids the SELECT-then-UPDATE race where two concurrent unlinks
  // would both succeed and double-write to audit_log.
  const [row] = await db
    .update(entityPersonLinks)
    .set({ validTo: new Date() })
    .where(and(eq(entityPersonLinks.id, linkId), isNull(entityPersonLinks.validTo)))
    .returning();

  if (!row) {
    const [existing] = await db
      .select({ validTo: entityPersonLinks.validTo })
      .from(entityPersonLinks)
      .where(eq(entityPersonLinks.id, linkId))
      .limit(1);
    if (!existing) throw new NotFoundError("entity_person_link", linkId);
    throw new ConflictError("Link is already closed", { linkId, closedAt: existing.validTo });
  }

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "entity.person_unlinked",
    payload: { linkId, entityId: row.entityId, personId: row.personId },
  });

  return row;
}
