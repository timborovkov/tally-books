"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ExpenseMassActions } from "@/components/settings/ExpenseMassActions";
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

const PAID_BY_LABEL: Record<string, string> = {
  entity: "Entity",
  personal_reimbursable: "Personal · reimbursable",
  personal_no_reimburse: "Personal",
};

const REIMBURSEMENT_LABEL: Record<
  string,
  { label: string; tone: "default" | "secondary" | "outline" | "destructive" }
> = {
  not_applicable: { label: "—", tone: "secondary" },
  pending: { label: "Owed back", tone: "destructive" },
  paid_back: { label: "Paid back", tone: "default" },
};

export interface ExpenseRow {
  id: string;
  occurredAt: string; // ISO
  entityName: string;
  vendor: string | null;
  categoryName: string | null;
  amount: string;
  currency: string;
  paidBy: string;
  reimbursementStatus: string;
  state: ThingState;
}

export interface ExpensesTableProps {
  rows: ExpenseRow[];
  bulkTransition: (form: FormData) => void | Promise<void>;
  bulkMarkReimbursed: (form: FormData) => void | Promise<void>;
}

export function ExpensesTable({ rows, bulkTransition, bulkMarkReimbursed }: ExpensesTableProps) {
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
                aria-label="Select all expenses"
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Paid by</TableHead>
            <TableHead>Reimbursement</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                No expenses match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const reimb =
                REIMBURSEMENT_LABEL[row.reimbursementStatus] ?? REIMBURSEMENT_LABEL.not_applicable!;
              return (
                <TableRow key={row.id} data-selected={selected.has(row.id) || undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select expense ${row.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.occurredAt.slice(0, 10)}</TableCell>
                  <TableCell>{row.entityName}</TableCell>
                  <TableCell>
                    <Link
                      href={`/settings/expenses/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.vendor ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.categoryName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.amount} {row.currency}
                  </TableCell>
                  <TableCell className="text-xs">
                    {PAID_BY_LABEL[row.paidBy] ?? row.paidBy}
                  </TableCell>
                  <TableCell>
                    <Badge variant={reimb.tone}>{reimb.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <StateBadge state={row.state} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <ExpenseMassActions
        selectedIds={selectedIds}
        bulkTransition={bulkTransition}
        bulkMarkReimbursed={bulkMarkReimbursed}
        onClear={clear}
      />
    </>
  );
}
