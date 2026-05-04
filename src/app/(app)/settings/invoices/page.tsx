import Link from "next/link";

import { InvoicesTable, type InvoiceRow } from "@/components/settings/InvoicesTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { listInvoices, type InvoiceState } from "@/domains/invoices";

import { bulkMarkInvoicesPaidAction, bulkTransitionInvoicesAction } from "./actions";

export const dynamic = "force-dynamic";

interface InvoicesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_STATES: InvoiceState[] = ["draft", "ready", "sent", "filed", "amending", "void"];

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

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const sp = await searchParams;
  const db = getDb();

  const entities = await listEntities(db, { includeArchived: false });

  const entityIdsParam = asArray(sp.entityId);
  const entityIds = entityIdsParam.length > 0 ? entityIdsParam : entities.map((e) => e.id);

  const states = asArray(sp.state).filter((s): s is InvoiceState =>
    (VALID_STATES as readonly string[]).includes(s),
  );
  const paidParam = asString(sp.paid);
  const paid = paidParam === "1" ? true : paidParam === "0" ? false : undefined;

  const result = await listInvoices(db, {
    entityIds,
    clientIds: asArray(sp.clientId),
    states: states.length > 0 ? states : undefined,
    paid,
    dateFrom: asDate(sp.dateFrom),
    dateTo: asDate(sp.dateTo),
    search: asString(sp.search),
    page: asInt(sp.page, 1),
    pageSize: asInt(sp.pageSize, 25),
  });

  const rows: InvoiceRow[] = result.rows.map((r) => ({
    id: r.id,
    number: r.number,
    issueDate: r.issueDate ? r.issueDate.toISOString() : null,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    entityName: r.entityName,
    clientName: r.clientName,
    total: r.total,
    currency: r.currency,
    state: r.state,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground text-sm">
            Outgoing invoices across every entity. Versioned, branded PDFs, internal
            entity-to-entity mirroring.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/settings/invoices/new">New invoice</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/settings/invoices/new?internal=1">Internal invoice</Link>
          </Button>
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" htmlFor="invoice-search">
            Search
          </label>
          <Input
            id="invoice-search"
            name="search"
            placeholder="Number / description"
            defaultValue={asString(sp.search) ?? ""}
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">State</span>
          <div className="flex flex-wrap gap-3">
            {VALID_STATES.map((s) => (
              <label key={s} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="state" value={s} defaultChecked={states.includes(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Paid</span>
          <select
            name="paid"
            defaultValue={paidParam ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">Any</option>
            <option value="1">Paid</option>
            <option value="0">Unpaid</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" htmlFor="dateFrom">
            From
          </label>
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={asString(sp.dateFrom) ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" htmlFor="dateTo">
            To
          </label>
          <Input id="dateTo" name="dateTo" type="date" defaultValue={asString(sp.dateTo) ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <InvoicesTable
        rows={rows}
        bulkTransition={bulkTransitionInvoicesAction}
        bulkMarkPaid={bulkMarkInvoicesPaidAction}
      />

      <Pagination page={result.page} pageSize={result.pageSize} totalCount={result.totalCount} />
    </div>
  );
}
