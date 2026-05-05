import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { parties, type Party } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { ConflictError, NotFoundError } from "../errors";

import {
  archivePartyInput,
  createPartyInput,
  updatePartyInput,
  type ArchivePartyInput,
  type CreatePartyInput,
  type UpdatePartyInput,
} from "./schema";

export async function createParty(
  db: Db,
  actor: CurrentActor,
  raw: CreatePartyInput,
): Promise<Party> {
  await assertCan(db, actor.user, "business_details", "write");
  const input = createPartyInput.parse(raw);

  const [row] = await db
    .insert(parties)
    .values({
      kind: input.kind,
      name: input.name,
      legalEntityId: input.legalEntityId ?? null,
      contact: input.contact,
      taxIds: input.taxIds,
      defaultTerms: input.defaultTerms,
      metadata: input.metadata,
    })
    .returning();

  if (!row) throw new Error("party insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "party.created",
    payload: { partyId: row.id, kind: row.kind, name: row.name },
  });

  return row;
}

export async function updateParty(
  db: Db,
  actor: CurrentActor,
  raw: UpdatePartyInput,
): Promise<Party> {
  await assertCan(db, actor.user, "business_details", "write");
  const input = updatePartyInput.parse(raw);

  const patch: Partial<typeof parties.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.name !== undefined) patch.name = input.name;
  if (input.legalEntityId !== undefined) patch.legalEntityId = input.legalEntityId;
  if (input.contact !== undefined) patch.contact = input.contact;
  if (input.taxIds !== undefined) patch.taxIds = input.taxIds;
  if (input.defaultTerms !== undefined) patch.defaultTerms = input.defaultTerms;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const [row] = await db.update(parties).set(patch).where(eq(parties.id, input.id)).returning();
  if (!row) throw new NotFoundError("party", input.id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "party.updated",
    payload: { partyId: row.id, fields: Object.keys(patch).filter((k) => k !== "updatedAt") },
  });

  return row;
}

/**
 * Soft-delete. Hard delete is intentionally not supported — invoices,
 * expenses, and time entries FK at this row with ON DELETE RESTRICT, and
 * a party's history is part of the accounting trail. Archiving hides
 * the row from active pickers; queries for historical reports still see
 * it.
 */
export async function archiveParty(
  db: Db,
  actor: CurrentActor,
  raw: ArchivePartyInput,
): Promise<Party> {
  await assertCan(db, actor.user, "business_details", "write");
  const input = archivePartyInput.parse(raw);

  const [existing] = await db.select().from(parties).where(eq(parties.id, input.id)).limit(1);
  if (!existing) throw new NotFoundError("party", input.id);
  if (existing.archivedAt !== null) {
    throw new ConflictError("party already archived", { partyId: input.id });
  }

  const [row] = await db
    .update(parties)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(parties.id, input.id))
    .returning();
  if (!row) throw new NotFoundError("party", input.id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "party.archived",
    payload: { partyId: row.id, reason: input.reason ?? null },
  });

  return row;
}

export async function unarchiveParty(db: Db, actor: CurrentActor, id: string): Promise<Party> {
  await assertCan(db, actor.user, "business_details", "write");

  const [existing] = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
  if (!existing) throw new NotFoundError("party", id);
  if (existing.archivedAt === null) {
    throw new ConflictError("party is not archived", { partyId: id });
  }

  const [row] = await db
    .update(parties)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(parties.id, id))
    .returning();
  if (!row) throw new NotFoundError("party", id);

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "party.unarchived",
    payload: { partyId: row.id },
  });

  return row;
}
