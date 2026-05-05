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
import { getExpenseStatement } from "@/domains/reports";
import { getCurrentActor } from "@/lib/auth-shim";

import { formatAmount, resolveReportContext } from "../_lib";

export const dynamic = "force-dynamic";

export default async function ExpenseStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const ctx = await resolveReportContext(params);
  const db = getDb();
  const actor = await getCurrentActor(db);

  const rows = await getExpenseStatement(db, actor, {
    entityIds: [ctx.selectedEntity.id],
    from: ctx.fy.startUtc,
    to: ctx.fy.endUtc,
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Expense statement</h1>
        <p className="text-muted-foreground text-sm">
          Expenses grouped by category for the selected fiscal year. Largest first.
        </p>
      </header>
      <PeriodPicker
        action="/reports/expenses"
        entities={ctx.entities}
        selectedEntityId={ctx.selectedEntity.id}
        fyStartYear={ctx.fy.startUtc.getUTCFullYear()}
        fyOptions={ctx.fyOptions}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                No expenses in this period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={`${r.categoryId ?? "uncat"}-${r.currency}-${i}`}>
                <TableCell>{r.categoryName}</TableCell>
                <TableCell className="font-mono text-xs">{r.currency}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatAmount(r.total)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
