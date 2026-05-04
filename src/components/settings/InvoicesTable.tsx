"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { InvoiceMassActions } from "@/components/settings/InvoiceMassActions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StateBadge } from "@/components/versioning/StateBadge";
import type { ThingState } from "@/lib/versioning";

export interface InvoiceRow {
  id: string;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  entityName: string;
  clientName: string | null;
  total: string | null;
  currency: string;
  state: ThingState;
  paidAt: string | null;
}

export interface InvoicesTableProps {
  rows: InvoiceRow[];
  bulkTransition: (form: FormData) => void | Promise<void>;
  bulkMarkPaid: (form: FormData) => void | Promise<void>;
}

export function InvoicesTable({ rows, bulkTransition, bulkMarkPaid }: InvoicesTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const allVisible = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return allVisible ? new Set() : new Set(rows.map((r) => r.id));
    });
  };

  const clear = () => setSelected(new Set());
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                aria-label="Select all invoices"
              />
            </TableHead>
            <TableHead>Number</TableHead>
            <TableHead>Issue date</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Paid?</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                No invoices match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} data-selected={selected.has(row.id) || undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    aria-label={`Select invoice ${row.id}`}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/settings/invoices/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.number ?? "DRAFT"}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.issueDate ? row.issueDate.slice(0, 10) : "—"}
                </TableCell>
                <TableCell>{row.entityName}</TableCell>
                <TableCell>{row.clientName ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">
                  {row.total !== null ? `${row.total} ${row.currency}` : "—"}
                </TableCell>
                <TableCell>
                  <StateBadge state={row.state} />
                </TableCell>
                <TableCell>
                  {row.paidAt ? <Badge>paid</Badge> : <Badge variant="outline">unpaid</Badge>}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <InvoiceMassActions
        selectedIds={selectedIds}
        bulkTransition={bulkTransition}
        bulkMarkPaid={bulkMarkPaid}
        onClear={clear}
      />
    </>
  );
}
