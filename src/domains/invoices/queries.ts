import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  auditLog,
  entities,
  invoiceVersions,
  invoices,
  parties,
  users,
  type AuditLogEntry,
  type Invoice,
  type InvoiceVersion,
} from "@/db/schema";
import type { invoiceDeliveryMethodEnum, thingStateEnum } from "@/db/schema/enums";

import { NotFoundError } from "../errors";

export type InvoiceState = (typeof thingStateEnum.enumValues)[number];
export type InvoiceDeliveryMethod = (typeof invoiceDeliveryMethodEnum.enumValues)[number];

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface ListInvoicesOptions {
  entityIds?: string[];
  clientIds?: string[];
  states?: InvoiceState[];
  deliveryMethods?: InvoiceDeliveryMethod[];
  /** `paid_at IS NOT NULL` (true) / `IS NULL` (false). Undefined = no filter. */
  paid?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  includeVoid?: boolean;
  page?: number;
  pageSize?: number;
}

export interface InvoiceListRow extends Invoice {
  entityName: string;
  clientName: string | null;
}

export interface ListInvoicesResult {
  rows: InvoiceListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function listInvoices(
  db: Db,
  opts: ListInvoicesOptions = {},
): Promise<ListInvoicesResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));

  if (opts.entityIds && opts.entityIds.length === 0) {
    return { rows: [], totalCount: 0, page, pageSize };
  }

  const filters: SQL[] = [];
  if (!opts.includeVoid) filters.push(ne(invoices.state, "void"));
  if (opts.entityIds && opts.entityIds.length > 0) {
    filters.push(inArray(invoices.entityId, opts.entityIds));
  }
  if (opts.clientIds && opts.clientIds.length > 0) {
    filters.push(inArray(invoices.clientId, opts.clientIds));
  }
  if (opts.states && opts.states.length > 0) {
    filters.push(inArray(invoices.state, opts.states));
  }
  if (opts.deliveryMethods && opts.deliveryMethods.length > 0) {
    filters.push(inArray(invoices.deliveryMethod, opts.deliveryMethods));
  }
  if (opts.paid === true) filters.push(isNotNull(invoices.paidAt));
  if (opts.paid === false) filters.push(isNull(invoices.paidAt));
  if (opts.dateFrom) filters.push(gte(invoices.issueDate, opts.dateFrom));
  if (opts.dateTo) filters.push(lte(invoices.issueDate, opts.dateTo));
  if (opts.search && opts.search.trim() !== "") {
    const q = opts.search.trim();
    const pattern = `%${escapeLikePattern(q)}%`;
    const searchClause = or(
      ilike(invoices.number, pattern),
      ilike(invoices.description, pattern),
      eq(invoices.id, q),
    );
    if (searchClause) filters.push(searchClause);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        invoice: invoices,
        entityName: entities.name,
        clientName: parties.name,
      })
      .from(invoices)
      .innerJoin(entities, eq(entities.id, invoices.entityId))
      .leftJoin(parties, eq(parties.id, invoices.clientId))
      .where(whereClause)
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(whereClause),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r.invoice,
      entityName: r.entityName,
      clientName: r.clientName,
    })),
    totalCount: Number(totalRows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export interface InvoiceWithRelations extends Invoice {
  entityName: string;
  clientName: string | null;
  mirrorEntityName: string | null;
}

export async function getInvoice(db: Db, id: string): Promise<InvoiceWithRelations> {
  const mirrorEntityNameSelect = sql<string | null>`(
    SELECT ${entities.name}
    FROM ${invoices} AS m
    INNER JOIN ${entities} ON ${entities.id} = m.entity_id
    WHERE m.id = ${invoices.mirrorInvoiceId}
    LIMIT 1
  )`;

  const [row] = await db
    .select({
      invoice: invoices,
      entityName: entities.name,
      clientName: parties.name,
      mirrorEntityName: mirrorEntityNameSelect,
    })
    .from(invoices)
    .innerJoin(entities, eq(entities.id, invoices.entityId))
    .leftJoin(parties, eq(parties.id, invoices.clientId))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("invoice", id);
  return {
    ...row.invoice,
    entityName: row.entityName,
    clientName: row.clientName,
    mirrorEntityName: row.mirrorEntityName,
  };
}

export interface InvoiceTimelineEntry {
  version: InvoiceVersion;
  actor: { id: string; name: string | null; email: string } | null;
}

export async function getInvoiceHistory(
  db: Db,
  id: string,
): Promise<InvoiceTimelineEntry[]> {
  const rows = await db
    .select({
      version: invoiceVersions,
      actor: { id: users.id, name: users.name, email: users.email },
    })
    .from(invoiceVersions)
    .leftJoin(users, eq(users.id, invoiceVersions.actorId))
    .where(eq(invoiceVersions.invoiceId, id))
    .orderBy(asc(invoiceVersions.versionNum));

  return rows.map((r) => ({
    version: r.version,
    actor: r.actor?.id ? { id: r.actor.id, name: r.actor.name, email: r.actor.email } : null,
  }));
}

export async function getInvoiceAuditEntries(
  db: Db,
  id: string,
): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.thingType, "invoice"), eq(auditLog.thingId, id)))
    .orderBy(desc(auditLog.at));
}
