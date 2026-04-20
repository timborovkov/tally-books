import Link from "next/link";

import { StateBadge } from "@/components/versioning/StateBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listReceipts } from "@/domains/receipts";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const rows = await listReceipts(getDb(), { includeVoid: false });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Receipts</h1>
          <p className="text-muted-foreground text-sm">
            Versioned source evidence. Every edit is kept; see the timeline on each receipt.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/receipts/new">New receipt</Link>
        </Button>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                No receipts yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">
                  {row.occurredAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>{row.entityName}</TableCell>
                <TableCell>
                  <Link
                    href={`/settings/receipts/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.vendor}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.amount} {row.currency}
                </TableCell>
                <TableCell>
                  <StateBadge state={row.state} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
