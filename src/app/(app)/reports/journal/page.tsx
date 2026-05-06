import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PeriodPicker } from "@/components/reports/period-picker";
import { getDb } from "@/db/client";
import { getJournal, type JournalSource } from "@/domains/reports";
import { getCurrentActor } from "@/lib/auth-shim";
import { formatUtcDate } from "@/lib/dates";

import { formatAmount, readParam, resolveReportContext } from "../_lib";

export const dynamic = "force-dynamic";

const VALID_SOURCES: readonly JournalSource[] = ["expense", "invoice", "receipt"];
const PAGE_SIZE = 50;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const ctx = await resolveReportContext(params);
  const db = getDb();
  const actor = await getCurrentActor(db);

  const sourceParam = readParam(params.source);
  const sources: JournalSource[] =
    sourceParam && VALID_SOURCES.includes(sourceParam as JournalSource)
      ? [sourceParam as JournalSource]
      : [];

  const pageRaw = Number(readParam(params.page) ?? "0");
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 && pageRaw < 10_000 ? pageRaw : 0;
  const offset = page * PAGE_SIZE;

  const { rows, total } = await getJournal(db, actor, {
    entityIds: [ctx.selectedEntity.id],
    from: ctx.fy.startUtc,
    to: ctx.fy.endUtc,
    sources,
    limit: PAGE_SIZE,
    offset,
  });

  const hasPrev = page > 0;
  const hasNext = offset + rows.length < total;
  // Preserve filters in pagination links so prev/next stays in the
  // same entity/FY/source view.
  const buildPageHref = (nextPage: number): string => {
    const sp = new URLSearchParams();
    sp.set("entityId", ctx.selectedEntity.id);
    sp.set("fy", String(ctx.fy.startUtc.getUTCFullYear()));
    if (sourceParam) sp.set("source", sourceParam);
    if (nextPage > 0) sp.set("page", String(nextPage));
    return `/reports/journal?${sp.toString()}`;
  };

  const sourceExtra = (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">Source</span>
      <select
        name="source"
        defaultValue={sourceParam ?? ""}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        <option value="">All</option>
        <option value="expense">Expenses</option>
        <option value="invoice">Invoices</option>
        <option value="receipt">Receipts</option>
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Journal</h1>
        <p className="text-muted-foreground text-sm">
          Every expense, invoice, and receipt in the period, newest first. Void rows shown muted.
        </p>
      </header>
      <PeriodPicker
        action="/reports/journal"
        entities={ctx.entities}
        selectedEntityId={ctx.selectedEntity.id}
        fyStartYear={ctx.fy.startUtc.getUTCFullYear()}
        fyOptions={ctx.fyOptions}
        extra={sourceExtra}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Ref</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                No entries in this period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={`${r.source}-${r.id}`}
                className={r.state === "void" ? "opacity-50" : ""}
              >
                <TableCell className="font-mono text-xs">{formatUtcDate(r.date)}</TableCell>
                <TableCell className="text-xs uppercase">{r.source}</TableCell>
                <TableCell className="font-mono text-xs">{r.ref || "—"}</TableCell>
                <TableCell>{r.party || "—"}</TableCell>
                <TableCell>{r.categoryName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.state === "void" ? "secondary" : "default"}>{r.state}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatAmount(r.amount)} {r.currency}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Showing {rows.length === 0 ? 0 : offset + 1}&ndash;{offset + rows.length} of {total}{" "}
          entries.
        </p>
        <div className="flex gap-2">
          <Button asChild={hasPrev} variant="outline" size="sm" disabled={!hasPrev}>
            {hasPrev ? <Link href={buildPageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button asChild={hasNext} variant="outline" size="sm" disabled={!hasNext}>
            {hasNext ? <Link href={buildPageHref(page + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
