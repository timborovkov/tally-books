import { and, desc, eq, isNull, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { documents, type Document } from "@/db/schema";
import type { documentKindEnum, documentOwnerTypeEnum } from "@/db/schema/enums";

export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type DocumentOwnerType = (typeof documentOwnerTypeEnum.enumValues)[number];

export interface ListDocumentsOptions {
  entityId?: string;
  ownerType?: DocumentOwnerType;
  ownerId?: string;
  kind?: DocumentKind;
  includeArchived?: boolean;
}

export async function listDocuments(db: Db, opts: ListDocumentsOptions = {}): Promise<Document[]> {
  const conditions: SQL[] = [];
  if (opts.entityId !== undefined) conditions.push(eq(documents.entityId, opts.entityId));
  if (opts.ownerType !== undefined) conditions.push(eq(documents.ownerType, opts.ownerType));
  if (opts.ownerId !== undefined) conditions.push(eq(documents.ownerId, opts.ownerId));
  if (opts.kind !== undefined) conditions.push(eq(documents.kind, opts.kind));
  if (!opts.includeArchived) conditions.push(isNull(documents.archivedAt));

  const where = conditions.length === 0 ? undefined : and(...conditions);
  return db.select().from(documents).where(where).orderBy(desc(documents.createdAt));
}
