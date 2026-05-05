import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, expenses, invoices, parties, receipts } from "@/db/schema";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

/**
 * Read-only aggregation queries that power /reports/*.
 *
 * Math runs in Postgres (`SUM(numeric)`) so totals stay in
 * `numeric(20, 4)` precision and never round-trip through JS floats.
 * Results come back as decimal strings — the UI formats them as-is.
 *
 * Currency mixing: in v0.1 each row carries its own `currency` and we
 * group totals per (period, currency). The FX recalc worker (v0.3) will
 * fill `amount_in_base` so a single base-currency total becomes
 * meaningful — until then, "all amounts in EUR" is a user-side
 * assumption, not a system guarantee.
 *
 * Authorization: each call asserts `reports:read` for every entity in
 * `entityIds`. Callers that already filtered to a single entity still
 * pass it through here so the gate can't be skipped.
 */

export interface ReportRange {
  /** Inclusive lower bound. */
  from: Date;
  /** Inclusive upper bound (use end-of-day or fiscal-year end). */
  to: Date;
}

export interface ReportOpts extends ReportRange {
  entityIds: readonly string[];
}

export interface MonthBucket {
  /** "YYYY-MM". */
  label: string;
  startUtc: Date;
  endUtc: Date;
}

async function assertCanReportOnAll(
  db: Db,
  actor: CurrentActor,
  entityIds: readonly string[],
): Promise<void> {
  for (const entityId of entityIds) {
    await assertCan(db, actor.user, "reports", "read", { entityId });
  }
}

function entityIdInList(entityIds: readonly string[]) {
  return sql.join(
    entityIds.map((id) => sql`${id}`),
    sql.raw(", "),
  );
}

/* ── Income statement ──────────────────────────────────────────────── */

/** One per (period, currency) — net is computed in SQL. */
export interface IncomeStatementCurrency {
  currency: string;
  /** Sum of `invoices.total` for the period, excluding void + mirrors. */
  revenue: string;
  /** Sum of `expenses.amount` for the period, excluding void. */
  expense: string;
  /** `revenue - expense`, computed in Postgres so no JS float drift. */
  net: string;
}

export interface IncomeStatementRow {
  period: string;
  currencies: IncomeStatementCurrency[];
}

export interface IncomeStatement {
  buckets: IncomeStatementRow[];
  /** Period type the buckets are grouped by — "month" or "fy". */
  granularity: "month" | "fy";
}

/**
 * Income statement: revenue (invoices) vs expenses, bucketed by month.
 *
 * `buckets` is dense — months in `[from, to]` with no activity show up
 * with `currencies: []`. Each currency present in either side gets a
 * row with `revenue`, `expense`, and `net` (revenue minus expense).
 *
 * Net is computed in SQL via `numeric(20,4) - numeric(20,4)`, then
 * cast to text. JS arithmetic on `numeric(20,4)` strings would lose
 * precision above ~$10M because `Number(...)` rounds to 53 bits.
 * Aggregation runs as a single FULL OUTER JOIN of revenue and expense
 * CTEs so a period that has only one side still produces a row.
 */
export async function getIncomeStatement(
  db: Db,
  actor: CurrentActor,
  opts: ReportOpts & { months: readonly MonthBucket[] },
): Promise<IncomeStatement> {
  await assertCanReportOnAll(db, actor, opts.entityIds);
  if (opts.entityIds.length === 0) {
    return {
      buckets: opts.months.map((m) => ({ period: m.label, currencies: [] })),
      granularity: "month",
    };
  }

  const ids = entityIdInList(opts.entityIds);
  const fromIso = opts.from.toISOString();
  const toIso = opts.to.toISOString();

  const result = (await db.execute(sql`
    WITH rev AS (
      SELECT
        to_char(${invoices.issueDate}, 'YYYY-MM') AS period,
        ${invoices.currency} AS currency,
        SUM(${invoices.total}) AS amt
      FROM ${invoices}
      WHERE ${invoices.entityId} IN (${ids})
        AND ${invoices.issueDate} IS NOT NULL
        AND ${invoices.total} IS NOT NULL
        AND ${invoices.issueDate} >= ${fromIso}::timestamptz
        AND ${invoices.issueDate} <= ${toIso}::timestamptz
        AND ${invoices.state} <> 'void'
        AND ${invoices.mirrorInvoiceId} IS NULL
      GROUP BY 1, 2
    ),
    exp AS (
      SELECT
        to_char(${expenses.occurredAt}, 'YYYY-MM') AS period,
        ${expenses.currency} AS currency,
        SUM(${expenses.amount}) AS amt
      FROM ${expenses}
      WHERE ${expenses.entityId} IN (${ids})
        AND ${expenses.occurredAt} >= ${fromIso}::timestamptz
        AND ${expenses.occurredAt} <= ${toIso}::timestamptz
        AND ${expenses.state} <> 'void'
      GROUP BY 1, 2
    )
    SELECT
      COALESCE(rev.period, exp.period) AS period,
      COALESCE(rev.currency, exp.currency) AS currency,
      COALESCE(rev.amt, 0)::text AS revenue,
      COALESCE(exp.amt, 0)::text AS expense,
      (COALESCE(rev.amt, 0) - COALESCE(exp.amt, 0))::text AS net
    FROM rev
    FULL OUTER JOIN exp ON rev.period = exp.period AND rev.currency = exp.currency
  `)) as unknown as {
    period: string;
    currency: string;
    revenue: string;
    expense: string;
    net: string;
  }[];

  const byPeriod = new Map<string, IncomeStatementRow>();
  for (const m of opts.months) byPeriod.set(m.label, { period: m.label, currencies: [] });
  for (const r of result) {
    const bucket = byPeriod.get(r.period);
    if (bucket) {
      bucket.currencies.push({
        currency: r.currency,
        revenue: r.revenue,
        expense: r.expense,
        net: r.net,
      });
    }
  }

  return {
    buckets: opts.months.map((m) => byPeriod.get(m.label)!),
    granularity: "month",
  };
}

/* ── Expense statement ─────────────────────────────────────────────── */

export interface ExpenseByCategoryRow {
  /** Null when the underlying expenses had no categoryId. */
  categoryId: string | null;
  /** "Uncategorized" when categoryId is null. */
  categoryName: string;
  currency: string;
  total: string;
}

export async function getExpenseStatement(
  db: Db,
  actor: CurrentActor,
  opts: ReportOpts,
): Promise<ExpenseByCategoryRow[]> {
  await assertCanReportOnAll(db, actor, opts.entityIds);
  if (opts.entityIds.length === 0) return [];

  const rows = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      currency: expenses.currency,
      total: sql<string>`SUM(${expenses.amount})::text`,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        inArray(expenses.entityId, opts.entityIds as string[]),
        gte(expenses.occurredAt, opts.from),
        lte(expenses.occurredAt, opts.to),
        ne(expenses.state, "void"),
      ),
    )
    .groupBy(expenses.categoryId, categories.name, expenses.currency)
    .orderBy(sql`SUM(${expenses.amount}) DESC`);

  return rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? "Uncategorized",
    currency: r.currency,
    total: r.total,
  }));
}

/* ── Cash flow ─────────────────────────────────────────────────────── */

/** One per (period, currency) — net is computed in SQL. */
export interface CashFlowCurrency {
  currency: string;
  inflow: string;
  outflow: string;
  net: string;
}

export interface CashFlowRow {
  period: string;
  currencies: CashFlowCurrency[];
}

/**
 * Cash flow: invoices.paidAt = inflow date, expenses.occurredAt =
 * outflow date. Expenses don't have a separate paidAt column in v0.1
 * (occurredAt is the economic date the user typed); when the bank-tx
 * linker lands in v0.3 the outflow side will move to the linked
 * transaction's value date. Documented here so the v0.1 number is
 * legible.
 *
 * Net is computed in SQL via FULL OUTER JOIN of inflow/outflow CTEs,
 * same pattern as `getIncomeStatement` — keeps `numeric(20,4)` exact.
 */
export async function getCashFlow(
  db: Db,
  actor: CurrentActor,
  opts: ReportOpts & { months: readonly MonthBucket[] },
): Promise<CashFlowRow[]> {
  await assertCanReportOnAll(db, actor, opts.entityIds);
  if (opts.entityIds.length === 0) {
    return opts.months.map((m) => ({ period: m.label, currencies: [] }));
  }

  const ids = entityIdInList(opts.entityIds);
  const fromIso = opts.from.toISOString();
  const toIso = opts.to.toISOString();

  const result = (await db.execute(sql`
    WITH inflow AS (
      SELECT
        to_char(${invoices.paidAt}, 'YYYY-MM') AS period,
        ${invoices.currency} AS currency,
        SUM(${invoices.total}) AS amt
      FROM ${invoices}
      WHERE ${invoices.entityId} IN (${ids})
        AND ${invoices.paidAt} IS NOT NULL
        AND ${invoices.total} IS NOT NULL
        AND ${invoices.paidAt} >= ${fromIso}::timestamptz
        AND ${invoices.paidAt} <= ${toIso}::timestamptz
        AND ${invoices.state} <> 'void'
        AND ${invoices.mirrorInvoiceId} IS NULL
      GROUP BY 1, 2
    ),
    outflow AS (
      SELECT
        to_char(${expenses.occurredAt}, 'YYYY-MM') AS period,
        ${expenses.currency} AS currency,
        SUM(${expenses.amount}) AS amt
      FROM ${expenses}
      WHERE ${expenses.entityId} IN (${ids})
        AND ${expenses.occurredAt} >= ${fromIso}::timestamptz
        AND ${expenses.occurredAt} <= ${toIso}::timestamptz
        AND ${expenses.state} <> 'void'
      GROUP BY 1, 2
    )
    SELECT
      COALESCE(inflow.period, outflow.period) AS period,
      COALESCE(inflow.currency, outflow.currency) AS currency,
      COALESCE(inflow.amt, 0)::text AS inflow,
      COALESCE(outflow.amt, 0)::text AS outflow,
      (COALESCE(inflow.amt, 0) - COALESCE(outflow.amt, 0))::text AS net
    FROM inflow
    FULL OUTER JOIN outflow ON inflow.period = outflow.period AND inflow.currency = outflow.currency
  `)) as unknown as {
    period: string;
    currency: string;
    inflow: string;
    outflow: string;
    net: string;
  }[];

  const byPeriod = new Map<string, CashFlowRow>();
  for (const m of opts.months) byPeriod.set(m.label, { period: m.label, currencies: [] });
  for (const r of result) {
    const bucket = byPeriod.get(r.period);
    if (bucket) {
      bucket.currencies.push({
        currency: r.currency,
        inflow: r.inflow,
        outflow: r.outflow,
        net: r.net,
      });
    }
  }
  return opts.months.map((m) => byPeriod.get(m.label)!);
}

/* ── Journal / ledger ──────────────────────────────────────────────── */

export type JournalSource = "expense" | "invoice" | "receipt";

export interface JournalRow {
  date: Date;
  source: JournalSource;
  id: string;
  /** External ref: invoice number / vendor / etc. Empty when none. */
  ref: string;
  party: string;
  categoryName: string | null;
  amount: string;
  currency: string;
  state: string;
  entityId: string;
}

export interface JournalOpts extends ReportOpts {
  /** Empty array = include all sources. */
  sources?: readonly JournalSource[];
  limit: number;
  offset: number;
}

/**
 * Combined chronological list of all transaction-like records.
 *
 * UNION ALL'd in SQL across expenses, invoices, and receipts so
 * pagination pushes down to the database — a 50k-row entity returns
 * the same page-sized payload as a 50-row entity. Void rows are
 * included (the UI mutes them) so the journal stays an honest record.
 *
 * Implemented with a raw `sql` template rather than Drizzle's
 * `unionAll(...)` because the latter requires every arm to share a
 * table brand at the type level — we're unioning across three
 * different tables, and the type system can't follow that pattern.
 * Every interpolated value (entity ids, dates, limit/offset) goes
 * through `sql` parameter binding, not string concatenation; the only
 * literal SQL is the column projection and the WHERE clauses on
 * structural columns.
 *
 * Column shape on every UNION arm:
 *   date | source | id | ref | party | category_name | amount | currency | state | entity_id
 *
 * Two queries (page + total) — `COUNT(*)` over a window function would
 * inflate the page payload with the same int 50 times.
 */
export async function getJournal(
  db: Db,
  actor: CurrentActor,
  opts: JournalOpts,
): Promise<{ rows: JournalRow[]; total: number }> {
  await assertCanReportOnAll(db, actor, opts.entityIds);
  if (opts.entityIds.length === 0) return { rows: [], total: 0 };

  const sources = opts.sources && opts.sources.length > 0 ? new Set(opts.sources) : null;
  const includes = (s: JournalSource): boolean => !sources || sources.has(s);

  const entityIds = [...opts.entityIds];
  const arms: ReturnType<typeof sql>[] = [];
  if (includes("expense")) arms.push(expenseArmSql(entityIds, opts.from, opts.to));
  if (includes("invoice")) arms.push(invoiceArmSql(entityIds, opts.from, opts.to));
  if (includes("receipt")) arms.push(receiptArmSql(entityIds, opts.from, opts.to));

  if (arms.length === 0) return { rows: [], total: 0 };

  // Build the union by joining arms with literal `UNION ALL`. Each arm
  // is itself a parameterized SELECT — the only literal text added
  // here is the operator keyword and the outer ORDER/LIMIT/OFFSET
  // wrapper.
  const unionBody = sql.join(arms, sql.raw(" UNION ALL "));

  // Stable sort: id is the secondary key so same-timestamp rows
  // (common — multiple expenses on the same occurredAt date) keep a
  // deterministic order across pages. Without this, OFFSET pagination
  // can duplicate or skip rows when the boundary lands inside a tie.
  const pageQuery = sql`${unionBody} ORDER BY date DESC, id DESC LIMIT ${opts.limit} OFFSET ${opts.offset}`;
  const countQuery = sql`SELECT COUNT(*)::int AS count FROM (${unionBody}) AS j`;

  const [pageResult, countResult] = await Promise.all([
    db.execute(pageQuery),
    db.execute(countQuery),
  ]);

  const pageRows = pageResult as unknown as JournalRowDb[];
  const countRows = countResult as unknown as { count: number }[];
  const total = countRows[0]?.count ?? 0;

  return {
    rows: pageRows.map((r) => ({
      // Drivers return timestamptz as Date; pg-js does this for us.
      date: r.date instanceof Date ? r.date : new Date(r.date),
      source: r.source as JournalSource,
      id: r.id,
      ref: r.ref,
      party: r.party,
      categoryName: r.category_name,
      amount: r.amount,
      currency: r.currency,
      state: r.state,
      entityId: r.entity_id,
    })),
    total,
  };
}

interface JournalRowDb {
  date: Date | string;
  source: string;
  id: string;
  ref: string;
  party: string;
  category_name: string | null;
  amount: string;
  currency: string;
  state: string;
  entity_id: string;
}

// postgres-js binding through the raw `sql` template path differs
// from Drizzle's builder path:
//   - JS Date objects don't auto-serialize → pass ISO strings + an
//     explicit `::timestamptz` cast.
//   - JS arrays don't bind as a single ARRAY/ANY param cleanly here
//     either → expand to `IN ($1, $2, ...)` via `entityIdInList`.

function expenseArmSql(entityIds: string[], from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const ids = entityIdInList(entityIds);
  return sql`SELECT
      ${expenses.occurredAt} AS date,
      'expense' AS source,
      ${expenses.id} AS id,
      '' AS ref,
      COALESCE(${expenses.vendor}, '') AS party,
      ${categories.name} AS category_name,
      ${expenses.amount} AS amount,
      ${expenses.currency} AS currency,
      ${expenses.state}::text AS state,
      ${expenses.entityId} AS entity_id
    FROM ${expenses}
    LEFT JOIN ${categories} ON ${expenses.categoryId} = ${categories.id}
    WHERE ${expenses.entityId} IN (${ids})
      AND ${expenses.occurredAt} >= ${fromIso}::timestamptz
      AND ${expenses.occurredAt} <= ${toIso}::timestamptz`;
}

function invoiceArmSql(entityIds: string[], from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const ids = entityIdInList(entityIds);
  return sql`SELECT
      ${invoices.issueDate} AS date,
      'invoice' AS source,
      ${invoices.id} AS id,
      COALESCE(${invoices.number}, '') AS ref,
      COALESCE(${parties.name}, '') AS party,
      NULL::text AS category_name,
      ${invoices.total} AS amount,
      ${invoices.currency} AS currency,
      ${invoices.state}::text AS state,
      ${invoices.entityId} AS entity_id
    FROM ${invoices}
    LEFT JOIN ${parties} ON ${invoices.clientId} = ${parties.id}
    WHERE ${invoices.entityId} IN (${ids})
      AND ${invoices.issueDate} IS NOT NULL
      AND ${invoices.total} IS NOT NULL
      AND ${invoices.issueDate} >= ${fromIso}::timestamptz
      AND ${invoices.issueDate} <= ${toIso}::timestamptz
      AND ${invoices.mirrorInvoiceId} IS NULL`;
}

function receiptArmSql(entityIds: string[], from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const ids = entityIdInList(entityIds);
  return sql`SELECT
      ${receipts.occurredAt} AS date,
      'receipt' AS source,
      ${receipts.id} AS id,
      '' AS ref,
      ${receipts.vendor} AS party,
      NULL::text AS category_name,
      ${receipts.amount} AS amount,
      ${receipts.currency} AS currency,
      ${receipts.state}::text AS state,
      ${receipts.entityId} AS entity_id
    FROM ${receipts}
    WHERE ${receipts.entityId} IN (${ids})
      AND ${receipts.occurredAt} >= ${fromIso}::timestamptz
      AND ${receipts.occurredAt} <= ${toIso}::timestamptz`;
}
