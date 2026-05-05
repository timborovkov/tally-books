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
import { getIncomeStatement } from "@/domains/reports";
import { getCurrentActor } from "@/lib/auth-shim";
import { monthsInFiscalYear } from "@/lib/fiscal-year";

import { formatAmount, resolveReportContext } from "../_lib";

export const dynamic = "force-dynamic";

export default async function IncomeStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const ctx = await resolveReportContext(params);
  const months = monthsInFiscalYear(ctx.fy);
  const db = getDb();
  const actor = await getCurrentActor(db);

  const statement = await getIncomeStatement(db, actor, {
    entityIds: [ctx.selectedEntity.id],
    from: ctx.fy.startUtc,
    to: ctx.fy.endUtc,
    months,
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Income statement</h1>
        <p className="text-muted-foreground text-sm">
          Revenue (from invoices, void rows excluded) versus expenses, by month.
        </p>
      </header>
      <PeriodPicker
        action="/reports/income"
        entities={ctx.entities}
        selectedEntityId={ctx.selectedEntity.id}
        fyStartYear={ctx.fy.startUtc.getUTCFullYear()}
        fyOptions={ctx.fyOptions}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Expenses</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.buckets.map((b) => (
            <TableRow key={b.period}>
              <TableCell className="font-mono text-xs">{b.period}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {b.currencies.length === 0
                  ? "—"
                  : b.currencies.map((c) => `${formatAmount(c.revenue)} ${c.currency}`).join(", ")}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {b.currencies.length === 0
                  ? "—"
                  : b.currencies.map((c) => `${formatAmount(c.expense)} ${c.currency}`).join(", ")}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {b.currencies.length === 0
                  ? "—"
                  : b.currencies.map((c) => `${formatAmount(c.net)} ${c.currency}`).join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
