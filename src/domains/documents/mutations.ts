import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { blobs, documents, entities, parties, persons, type Document } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { NotFoundError, ValidationError } from "../errors";

import { createDocumentInput, type CreateDocumentInput } from "./schema";

/**
 * Validate the polymorphic owner exists. The `(owner_type, owner_id)`
 * pair has no FK because the target table varies; this gate is the
 * service-layer contract that keeps the column from drifting.
 */
async function assertOwnerExists(
  db: Db,
  ownerType: Document["ownerType"],
  ownerId: string,
): Promise<void> {
  if (ownerType === "party") {
    const [row] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, ownerId));
    if (!row) throw new NotFoundError("party", ownerId);
    return;
  }
  if (ownerType === "person") {
    const [row] = await db.select({ id: persons.id }).from(persons).where(eq(persons.id, ownerId));
    if (!row) throw new NotFoundError("person", ownerId);
    return;
  }
  if (ownerType === "entity") {
    const [row] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, ownerId));
    if (!row) throw new NotFoundError("entity", ownerId);
    return;
  }
  throw new ValidationError("unknown owner_type", { ownerType });
}

async function assertBlobExists(db: Db, blobId: string): Promise<void> {
  const [row] = await db.select({ id: blobs.id }).from(blobs).where(eq(blobs.id, blobId));
  if (!row) throw new NotFoundError("blob", blobId);
}

export async function createDocument(
  db: Db,
  actor: CurrentActor,
  raw: CreateDocumentInput,
): Promise<Document> {
  // Documents touch sensitive material; gate behind legal_documents.
  await assertCan(db, actor.user, "legal_documents", "write");
  const input = createDocumentInput.parse(raw);

  await assertBlobExists(db, input.blobId);
  await assertOwnerExists(db, input.ownerType, input.ownerId);

  const [row] = await db
    .insert(documents)
    .values({
      entityId: input.entityId ?? null,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      blobId: input.blobId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      tags: input.tags,
      metadata: input.metadata,
    })
    .returning();
  if (!row) throw new Error("document insert returned no row");

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "document.created",
    payload: {
      documentId: row.id,
      kind: row.kind,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
    },
  });

  return row;
}
