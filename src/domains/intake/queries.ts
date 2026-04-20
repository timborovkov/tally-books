import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  auditLog,
  blobs,
  entities,
  intakeItems,
  users,
  type AuditLogEntry,
  type Blob,
  type IntakeItem,
} from "@/db/schema";

import { NotFoundError } from "../errors";

export interface IntakeListRow extends IntakeItem {
  blob: Blob;
  entityName: string | null;
  uploadedByName: string | null;
}

export interface ListIntakeOptions {
  statuses?: IntakeItem["status"][];
  entityId?: string;
}

/**
 * Inbox list. Joins the blob (needed for thumbnail + content type)
 * and the entity name so the server-rendered page doesn't N+1. The
 * ordering matches the "needs_review"-first expectation — sorts
 * lowest overallConfidence (highest uncertainty) first, then most
 * recent uploads after that.
 */
export async function listIntakeItems(
  db: Db,
  opts: ListIntakeOptions = {},
): Promise<IntakeListRow[]> {
  const filters = [
    opts.statuses && opts.statuses.length > 0
      ? inArray(intakeItems.status, opts.statuses)
      : undefined,
    opts.entityId ? eq(intakeItems.entityId, opts.entityId) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const rows = await db
    .select({
      item: intakeItems,
      blob: blobs,
      entityName: entities.name,
      uploadedByName: users.name,
    })
    .from(intakeItems)
    .innerJoin(blobs, eq(blobs.id, intakeItems.blobId))
    .leftJoin(entities, eq(entities.id, intakeItems.entityId))
    .leftJoin(users, eq(users.id, intakeItems.uploadedById))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(intakeItems.uploadedAt));

  return rows.map((r) => ({
    ...r.item,
    blob: r.blob,
    entityName: r.entityName,
    uploadedByName: r.uploadedByName,
  }));
}

export async function getIntakeItem(db: Db, id: string): Promise<IntakeListRow> {
  const [row] = await db
    .select({
      item: intakeItems,
      blob: blobs,
      entityName: entities.name,
      uploadedByName: users.name,
    })
    .from(intakeItems)
    .innerJoin(blobs, eq(blobs.id, intakeItems.blobId))
    .leftJoin(entities, eq(entities.id, intakeItems.entityId))
    .leftJoin(users, eq(users.id, intakeItems.uploadedById))
    .where(eq(intakeItems.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("intake_item", id);
  return {
    ...row.item,
    blob: row.blob,
    entityName: row.entityName,
    uploadedByName: row.uploadedByName,
  };
}

export async function getIntakeAuditEntries(
  db: Db,
  intakeItemId: string,
): Promise<AuditLogEntry[]> {
  // Audit entries for intake items live under the loose verb-noun
  // actions `intake.*`. No thing_type enum value covers intake yet
  // (it isn't a versioned Thing), so we filter by payload.intakeItemId
  // — the whole column is jsonb, so this uses a JSON path operator.
  // Keep simple for v0.2 by scanning within the known action set.
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.action, [
          "intake.uploaded",
          "intake.ocr_applied",
          "intake.ocr_failed",
          "intake.routed",
          "intake.confirmed",
          "intake.rejected",
          "intake.wrong_route",
          "intake.re_routed",
        ]),
        // Narrow on payload->>'intakeItemId'. Audit payload is jsonb;
        // the ->> operator reads a text field out of it. A composite
        // (action, payload->>) index can speed this up later if
        // inbox history views start to dominate; for v0.2 the full
        // scan over intake.* rows is cheap.
        sql`${auditLog.payload} ->> 'intakeItemId' = ${intakeItemId}`,
      ),
    )
    .orderBy(desc(auditLog.at));
}
