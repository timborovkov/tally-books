import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/reports/income",
    title: "Income statement",
    description: "Revenue (invoices) versus expenses, by month within a fiscal year.",
  },
  {
    href: "/reports/expenses",
    title: "Expense statement",
    description: "Expenses grouped by category, sorted largest first.",
  },
  {
    href: "/reports/cash-flow",
    title: "Cash flow",
    description: "Inflows (paid invoices) versus outflows (expenses) by month.",
  },
  {
    href: "/reports/journal",
    title: "Journal",
    description: "Chronological list of every expense, invoice, and receipt.",
  },
] as const;

export default function ReportsIndexPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Read-only views over the data in your books. Numbers refresh on every page load.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
