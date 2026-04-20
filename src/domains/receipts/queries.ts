import { and, asc, desc, eq, ne } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  auditLog,
  entities,
  receipts,
  receiptVersions,
  users,
  type AuditLogEntry,
  type Receipt,
  type ReceiptVersion,
} from "@/db/schema";

import { NotFoundError } from "../errors";

export interface ListReceiptsOptions {
  entityId?: string;
  includeVoid?: boolean;
}

export async function listReceipts(
  db: Db,
  opts: ListReceiptsOptions = {},
): Promise<Array<Receipt & { entityName: string }>> {
  const filters = [
    opts.entityId ? eq(receipts.entityId, opts.entityId) : undefined,
    opts.includeVoid ? undefined : ne(receipts.state, "void"),
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const rows = await db
    .select({
      receipt: receipts,
      entityName: entities.name,
    })
    .from(receipts)
    .innerJoin(entities, eq(entities.id, receipts.entityId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(receipts.occurredAt));

  return rows.map((r) => ({ ...r.receipt, entityName: r.entityName }));
}

export async function getReceipt(db: Db, id: string): Promise<Receipt> {
  const [row] = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  if (!row) throw new NotFoundError("receipt", id);
  return row;
}

export interface ReceiptTimelineEntry {
  version: ReceiptVersion;
  actor: { id: string; name: string | null; email: string } | null;
}

export async function getReceiptHistory(db: Db, id: string): Promise<ReceiptTimelineEntry[]> {
  const rows = await db
    .select({
      version: receiptVersions,
      actor: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(receiptVersions)
    .leftJoin(users, eq(users.id, receiptVersions.actorId))
    .where(eq(receiptVersions.receiptId, id))
    .orderBy(asc(receiptVersions.versionNum));

  return rows.map((r) => ({
    version: r.version,
    actor: r.actor?.id ? { id: r.actor.id, name: r.actor.name, email: r.actor.email } : null,
  }));
}

export async function getReceiptAuditEntries(db: Db, id: string): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.thingType, "receipt"), eq(auditLog.thingId, id)))
    .orderBy(desc(auditLog.at));
}
