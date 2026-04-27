import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import {
  auditLog,
  categories,
  entities,
  expenses,
  expenseVersions,
  receipts,
  users,
  type AuditLogEntry,
  type Expense,
  type ExpenseVersion,
} from "@/db/schema";

import { NotFoundError } from "../errors";

export type ExpensePaidBy = "entity" | "personal_reimbursable" | "personal_no_reimburse";
export type ReimbursementStatus = "not_applicable" | "pending" | "paid_back";

/**
 * Escape LIKE/ILIKE wildcards in user-supplied search input. Without
 * this, `%` matches everything and `_` matches any single char, so a
 * user typing "20%" or "foo_bar" gets unrelated rows back. We
 * backslash-escape the three SQL LIKE specials (\, %, _). Postgres
 * uses backslash as the LIKE escape char by default — no ESCAPE clause
 * needed.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export interface ListExpensesOptions {
  /**
   * If provided, restrict to these entities. Empty array means "no
   * entities visible" → returns []. Undefined means "no entity filter
   * applied" (caller has already done IAM scoping upstream).
   */
  entityIds?: string[];
  categoryIds?: string[];
  paidBy?: ExpensePaidBy[];
  reimbursementStatus?: ReimbursementStatus[];
  vendor?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /**
   * Free-text search applied to vendor + description with ILIKE, plus
   * exact-match on id (so a copied URL slug or a user pasting an id
   * lands directly on the row).
   */
  search?: string;
  includeVoid?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ExpenseListRow extends Expense {
  entityName: string;
  categoryName: string | null;
  receiptVendor: string | null;
}

export interface ListExpensesResult {
  rows: ExpenseListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function listExpenses(
  db: Db,
  opts: ListExpensesOptions = {},
): Promise<ListExpensesResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE));

  // Empty entity-id list explicitly means "user can see no entities";
  // returning early avoids running a query that would do nothing useful
  // and accidentally short-circuits IAM-zero cases. Distinct from
  // `undefined` (no filter at all).
  if (opts.entityIds && opts.entityIds.length === 0) {
    return { rows: [], totalCount: 0, page, pageSize };
  }

  const filters: SQL[] = [];
  if (!opts.includeVoid) filters.push(ne(expenses.state, "void"));
  if (opts.entityIds && opts.entityIds.length > 0) {
    filters.push(inArray(expenses.entityId, opts.entityIds));
  }
  if (opts.categoryIds && opts.categoryIds.length > 0) {
    filters.push(inArray(expenses.categoryId, opts.categoryIds));
  }
  if (opts.paidBy && opts.paidBy.length > 0) {
    filters.push(inArray(expenses.paidBy, opts.paidBy));
  }
  if (opts.reimbursementStatus && opts.reimbursementStatus.length > 0) {
    filters.push(inArray(expenses.reimbursementStatus, opts.reimbursementStatus));
  }
  if (opts.vendor && opts.vendor.trim() !== "") {
    filters.push(ilike(expenses.vendor, `%${escapeLikePattern(opts.vendor.trim())}%`));
  }
  if (opts.dateFrom) filters.push(gte(expenses.occurredAt, opts.dateFrom));
  if (opts.dateTo) filters.push(lte(expenses.occurredAt, opts.dateTo));
  if (opts.search && opts.search.trim() !== "") {
    const q = opts.search.trim();
    const pattern = `%${escapeLikePattern(q)}%`;
    // Exact-match on id uses the raw `q` (id contains no LIKE specials).
    const searchClause = or(
      ilike(expenses.vendor, pattern),
      ilike(expenses.description, pattern),
      eq(expenses.id, q),
    );
    if (searchClause) filters.push(searchClause);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  // Two queries: paginated rows + total count. A window-function based
  // approach (`COUNT(*) OVER ()`) would be one round-trip but the
  // joined select widens the row → multiplies the count work. Simpler
  // to issue them in parallel.
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        expense: expenses,
        entityName: entities.name,
        categoryName: categories.name,
        receiptVendor: receipts.vendor,
      })
      .from(expenses)
      .innerJoin(entities, eq(entities.id, expenses.entityId))
      .leftJoin(categories, eq(categories.id, expenses.categoryId))
      .leftJoin(receipts, eq(receipts.id, expenses.linkedReceiptId))
      .where(whereClause)
      .orderBy(desc(expenses.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(whereClause),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r.expense,
      entityName: r.entityName,
      categoryName: r.categoryName,
      receiptVendor: r.receiptVendor,
    })),
    totalCount: Number(totalRows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export interface ExpenseWithLinks extends Expense {
  linkedReceiptVendor: string | null;
  linkedReceiptOccurredAt: Date | null;
}

export async function getExpense(db: Db, id: string): Promise<ExpenseWithLinks> {
  const [row] = await db
    .select({
      expense: expenses,
      receiptVendor: receipts.vendor,
      receiptOccurredAt: receipts.occurredAt,
    })
    .from(expenses)
    .leftJoin(receipts, eq(receipts.id, expenses.linkedReceiptId))
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row) throw new NotFoundError("expense", id);
  return {
    ...row.expense,
    linkedReceiptVendor: row.receiptVendor,
    linkedReceiptOccurredAt: row.receiptOccurredAt,
  };
}

export interface ExpenseTimelineEntry {
  version: ExpenseVersion;
  actor: { id: string; name: string | null; email: string } | null;
}

export async function getExpenseHistory(db: Db, id: string): Promise<ExpenseTimelineEntry[]> {
  const rows = await db
    .select({
      version: expenseVersions,
      actor: { id: users.id, name: users.name, email: users.email },
    })
    .from(expenseVersions)
    .leftJoin(users, eq(users.id, expenseVersions.actorId))
    .where(eq(expenseVersions.expenseId, id))
    .orderBy(asc(expenseVersions.versionNum));

  return rows.map((r) => ({
    version: r.version,
    actor: r.actor?.id ? { id: r.actor.id, name: r.actor.name, email: r.actor.email } : null,
  }));
}

export async function getExpenseAuditEntries(db: Db, id: string): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.thingType, "expense"), eq(auditLog.thingId, id)))
    .orderBy(desc(auditLog.at));
}

/**
 * Lightweight receipt search for the link picker. Same-entity only by
 * design — see linkReceipt() in mutations.
 */
export interface ReceiptCandidate {
  id: string;
  vendor: string;
  occurredAt: Date;
  amount: string;
  currency: string;
}

export async function searchReceiptsForExpense(
  db: Db,
  opts: { entityId: string; query?: string; limit?: number },
): Promise<ReceiptCandidate[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 10));
  const filters: SQL[] = [eq(receipts.entityId, opts.entityId), ne(receipts.state, "void")];
  if (opts.query && opts.query.trim() !== "") {
    filters.push(ilike(receipts.vendor, `%${escapeLikePattern(opts.query.trim())}%`));
  }
  return db
    .select({
      id: receipts.id,
      vendor: receipts.vendor,
      occurredAt: receipts.occurredAt,
      amount: receipts.amount,
      currency: receipts.currency,
    })
    .from(receipts)
    .where(and(...filters))
    .orderBy(desc(receipts.occurredAt))
    .limit(limit);
}
