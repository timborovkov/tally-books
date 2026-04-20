import { and, count, eq, isNull } from "drizzle-orm";

import type { Db } from "@/db/client";
import { entityPersonLinks, persons, type Person } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { ConflictError, NotFoundError } from "../errors";

import {
  createPersonInput,
  updatePersonInput,
  type CreatePersonInput,
  type UpdatePersonInput,
} from "./schema";

export async function createPerson(
  db: Db,
  actor: CurrentActor,
  raw: CreatePersonInput,
): Promise<Person> {
  await assertCan(actor.user, "personal_details", "write");
  const input = createPersonInput.parse(raw);

  const [row] = await db
    .insert(persons)
    .values({
      legalName: input.legalName,
      taxResidency: input.taxResidency ?? null,
      ids: input.ids,
      addresses: input.addresses,
      contact: input.contact,
      metadata: input.metadata,
      userId: input.userId ?? null,
    })
    .returning();

  if (!row) throw new Error("person insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "person.created",
    payload: { personId: row.id, legalName: row.legalName },
  });

  return row;
}

export async function updatePerson(
  db: Db,
  actor: CurrentActor,
  raw: UpdatePersonInput,
): Promise<Person> {
  const input = updatePersonInput.parse(raw);
  await assertCan(actor.user, "personal_details", "write", { personId: input.id });

  const patch: Partial<typeof persons.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.legalName !== undefined) patch.legalName = input.legalName;
  if (input.taxResidency !== undefined) patch.taxResidency = input.taxResidency;
  if (input.ids !== undefined) patch.ids = input.ids;
  if (input.addresses !== undefined) patch.addresses = input.addresses;
  if (input.contact !== undefined) patch.contact = input.contact;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.userId !== undefined) patch.userId = input.userId;

  const [row] = await db.update(persons).set(patch).where(eq(persons.id, input.id)).returning();
  if (!row) throw new NotFoundError("person", input.id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "person.updated",
    payload: { personId: row.id, fields: Object.keys(patch) },
  });

  return row;
}

export async function deletePerson(db: Db, actor: CurrentActor, id: string): Promise<void> {
  await assertCan(actor.user, "personal_details", "write", { personId: id });
  // Block when active links exist. Inactive (closed) links stay so
  // historical reports keep working.
  const [active] = await db
    .select({ n: count() })
    .from(entityPersonLinks)
    .where(and(eq(entityPersonLinks.personId, id), isNull(entityPersonLinks.validTo)));

  if ((active?.n ?? 0) > 0) {
    throw new ConflictError(
      "Cannot delete a person with active entity links — end the links first",
      { personId: id, activeLinks: active?.n ?? 0 },
    );
  }

  // Block when person is also a platform user. Platform-user persons
  // are deactivated by removing the user, not the person.
  const [row] = await db.select({ userId: persons.userId }).from(persons).where(eq(persons.id, id));
  if (!row) throw new NotFoundError("person", id);
  if (row.userId !== null) {
    throw new ConflictError(
      "Cannot delete a person linked to a platform user — remove the user first",
      { personId: id, userId: row.userId },
    );
  }

  await db.delete(persons).where(eq(persons.id, id));

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "person.deleted",
    payload: { personId: id },
  });
}
