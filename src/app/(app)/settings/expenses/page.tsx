import Link from "next/link";

import { ExpenseFilterBar } from "@/components/settings/ExpenseFilterBar";
import { ExpensesTable, type ExpenseRow } from "@/components/settings/ExpensesTable";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { getDb } from "@/db/client";
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";
import { listExpenses, type ExpensePaidBy, type ReimbursementStatus } from "@/domains/expenses";

import { bulkMarkReimbursedAction, bulkTransitionAction } from "./actions";

export const dynamic = "force-dynamic";

interface ExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

function asInt(v: string | string[] | undefined, fallback: number): number {
  const s = asString(v);
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asDate(v: string | string[] | undefined): Date | undefined {
  const s = asString(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const PAID_BY_VALUES: ExpensePaidBy[] = [
  "entity",
  "personal_reimbursable",
  "personal_no_reimburse",
];
const REIMB_VALUES: ReimbursementStatus[] = ["not_applicable", "pending", "paid_back"];

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const sp = await searchParams;
  const db = getDb();

  // listCategories with no entityId returns every non-archived
  // expense-kind category. One query covers entity-scoped + global +
  // personal — the per-entity fan-out before this was redundant N+1.
  const [entities, allExpenseCategories] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db, { kind: "expense" }),
  ]);
  const allCategoryOptions = allExpenseCategories
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entityIdsParam = asArray(sp.entityId);
  // No filter selected → search across every visible entity (default
  // "all entities" behaviour from the spec). When the user picks one
  // or more, restrict to that subset.
  const entityIds = entityIdsParam.length > 0 ? entityIdsParam : entities.map((e) => e.id);

  const paidByFilter = asArray(sp.paidBy).filter((v): v is ExpensePaidBy =>
    PAID_BY_VALUES.includes(v as ExpensePaidBy),
  );
  const reimbFilter = asArray(sp.reimbursementStatus).filter((v): v is ReimbursementStatus =>
    REIMB_VALUES.includes(v as ReimbursementStatus),
  );

  const result = await listExpenses(db, {
    entityIds,
    categoryIds: asArray(sp.categoryId),
    paidBy: paidByFilter,
    reimbursementStatus: reimbFilter,
    vendor: asString(sp.vendor),
    dateFrom: asDate(sp.dateFrom),
    dateTo: asDate(sp.dateTo),
    search: asString(sp.search),
    page: asInt(sp.page, 1),
    pageSize: asInt(sp.pageSize, 25),
  });

  const rows: ExpenseRow[] = result.rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    entityName: r.entityName,
    vendor: r.vendor,
    categoryName: r.categoryName,
    amount: r.amount,
    currency: r.currency,
    paidBy: r.paidBy,
    reimbursementStatus: r.reimbursementStatus,
    state: r.state,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-muted-foreground text-sm">
            Versioned accounting facts across every entity. Filters and search drive the URL — share
            a link to share a view.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/expenses/new">New expense</Link>
        </Button>
      </header>

      <ExpenseFilterBar
        entities={entities.map((e) => ({ id: e.id, name: e.name }))}
        categories={allCategoryOptions}
      />

      <ExpensesTable
        rows={rows}
        bulkTransition={bulkTransitionAction}
        bulkMarkReimbursed={bulkMarkReimbursedAction}
      />

      <Pagination page={result.page} pageSize={result.pageSize} totalCount={result.totalCount} />
    </div>
  );
}
