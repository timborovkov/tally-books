import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  entities,
  entityPersonLinks,
  jurisdictions,
  persons,
  type Entity,
  type EntityPersonLink,
  type Jurisdiction,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { jurisdictionConfigSchema } from "@/lib/jurisdictions/types";

import { ConflictError, NotFoundError, ValidationError } from "../errors";

import {
  createEntityInput,
  linkPersonInput,
  updateEntityInput,
  type CreateEntityInput,
  type LinkPersonInput,
  type UpdateEntityInput,
} from "./schema";

/**
 * Cross-check that an entity_type value is allowed by the jurisdiction's
 * config. The form filters this client-side, but the form is just a
 * convenience — a stale browser tab, a curl call, or a future API
 * client could still post a mismatched pair. This is the authoritative
 * gate.
 *
 * Returns silently if the jurisdiction has no config or no
 * entityTypes list (empty / malformed configs default to permissive
 * since the data layer is the wrong place to invent business rules).
 */
function assertEntityTypeMatchesJurisdiction(
  jurisdiction: Pick<Jurisdiction, "code" | "config">,
  entityType: string | null | undefined,
): void {
  if (!entityType) return;
  const parsed = jurisdictionConfigSchema.safeParse(jurisdiction.config);
  if (!parsed.success) return;
  const allowed = parsed.data.entityTypes;
  if (allowed.length === 0) return;
  if (!allowed.includes(entityType)) {
    throw new ValidationError(
      `Entity type "${entityType}" is not allowed in jurisdiction ${jurisdiction.code}. ` +
        `Allowed: ${allowed.join(", ")}.`,
      { field: "entityType", jurisdictionCode: jurisdiction.code, allowed },
    );
  }
}

export async function createEntity(
  db: Db,
  actor: CurrentActor,
  raw: CreateEntityInput,
): Promise<Entity> {
  const input = createEntityInput.parse(raw);

  // Check FK ourselves so the error message is actionable instead of a
  // raw 23503 leaking out. We need code + config too, for the
  // entity-type cross-check below.
  const [j] = await db
    .select({ code: jurisdictions.code, config: jurisdictions.config })
    .from(jurisdictions)
    .where(eq(jurisdictions.id, input.jurisdictionId))
    .limit(1);

  if (!j) {
    throw new ValidationError(`Unknown jurisdiction: ${input.jurisdictionId}`, {
      field: "jurisdictionId",
    });
  }

  assertEntityTypeMatchesJurisdiction(j, input.entityType);

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

  // Pull the existing entity so we can validate the (jurisdiction,
  // entityType) pair against the *target* jurisdiction — which may be
  // either the new jurisdictionId in the patch or the entity's
  // current one if jurisdictionId isn't changing.
  const [existing] = await db
    .select({ jurisdictionId: entities.jurisdictionId, entityType: entities.entityType })
    .from(entities)
    .where(eq(entities.id, input.id))
    .limit(1);
  if (!existing) throw new NotFoundError("entity", input.id);

  const targetJurisdictionId = input.jurisdictionId ?? existing.jurisdictionId;
  const [j] = await db
    .select({ code: jurisdictions.code, config: jurisdictions.config })
    .from(jurisdictions)
    .where(eq(jurisdictions.id, targetJurisdictionId))
    .limit(1);
  if (!j) {
    throw new ValidationError(`Unknown jurisdiction: ${targetJurisdictionId}`, {
      field: "jurisdictionId",
    });
  }

  // Validate the entity_type that will end up persisted: the new value
  // if the patch includes one, otherwise the existing value (which now
  // needs to be valid in the new jurisdiction if jurisdictionId moved).
  const targetEntityType = input.entityType !== undefined ? input.entityType : existing.entityType;
  assertEntityTypeMatchesJurisdiction(j, targetEntityType);

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
