import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  entities,
  entityPersonLinks,
  jurisdictions,
  persons,
  type Entity,
  type EntityPersonLink,
  type Jurisdiction,
  type Person,
} from "@/db/schema";

export interface ListEntitiesOptions {
  includeArchived?: boolean;
}

export async function listEntities(
  db: Db,
  options: ListEntitiesOptions = {},
): Promise<(Entity & { jurisdiction: Jurisdiction })[]> {
  const rows = await db
    .select({ entity: entities, jurisdiction: jurisdictions })
    .from(entities)
    .innerJoin(jurisdictions, eq(jurisdictions.id, entities.jurisdictionId))
    .where(options.includeArchived ? undefined : isNull(entities.archivedAt))
    .orderBy(asc(entities.name));

  return rows.map((r) => ({ ...r.entity, jurisdiction: r.jurisdiction }));
}

export interface EntityDetail {
  entity: Entity;
  jurisdiction: Jurisdiction;
  links: (EntityPersonLink & { person: Person })[];
}

export async function getEntityById(
  db: Db,
  id: string,
  options: { activeAt?: Date } = {},
): Promise<EntityDetail | null> {
  const [head] = await db
    .select({ entity: entities, jurisdiction: jurisdictions })
    .from(entities)
    .innerJoin(jurisdictions, eq(jurisdictions.id, entities.jurisdictionId))
    .where(eq(entities.id, id))
    .limit(1);

  if (!head) return null;

  const activeAt = options.activeAt ?? new Date();
  const linkRows = await db
    .select({ link: entityPersonLinks, person: persons })
    .from(entityPersonLinks)
    .innerJoin(persons, eq(persons.id, entityPersonLinks.personId))
    .where(
      and(
        eq(entityPersonLinks.entityId, id),
        or(isNull(entityPersonLinks.validTo), gt(entityPersonLinks.validTo, activeAt)),
      ),
    )
    .orderBy(desc(entityPersonLinks.validFrom));

  return {
    entity: head.entity,
    jurisdiction: head.jurisdiction,
    links: linkRows.map((r) => ({ ...r.link, person: r.person })),
  };
}

export async function listPersonsForEntity(
  db: Db,
  entityId: string,
  options: { activeAt?: Date } = {},
): Promise<(EntityPersonLink & { person: Person })[]> {
  const activeAt = options.activeAt ?? new Date();
  const rows = await db
    .select({ link: entityPersonLinks, person: persons })
    .from(entityPersonLinks)
    .innerJoin(persons, eq(persons.id, entityPersonLinks.personId))
    .where(
      and(
        eq(entityPersonLinks.entityId, entityId),
        or(isNull(entityPersonLinks.validTo), gt(entityPersonLinks.validTo, activeAt)),
      ),
    )
    .orderBy(desc(entityPersonLinks.validFrom));

  return rows.map((r) => ({ ...r.link, person: r.person }));
}
