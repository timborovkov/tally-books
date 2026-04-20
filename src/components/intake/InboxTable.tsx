"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { IntakeStatusBadge } from "@/components/intake/IntakeStatusBadge";
import {
  MassActionsBar,
  type MassActionsBarEntity,
  type MassActionsBarProps,
} from "@/components/intake/MassActionsBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Minimal row shape the inbox renders. Kept narrow so the server
 * doesn't serialise the whole `IntakeListRow` — domain types with
 * `jsonb` columns don't round-trip cleanly across the server/client
 * boundary.
 */
export interface InboxRow {
  id: string;
  uploadedAt: string;
  status: string;
  ocrStatus: string;
  entityName: string | null;
  isPersonal: string | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  blob: {
    id: string;
    contentType: string;
  };
}

export interface InboxTableProps {
  rows: InboxRow[];
  entities: MassActionsBarEntity[];
  serverActions: Omit<MassActionsBarProps, "selectedIds" | "entities" | "onClear">;
}

function OcrPill({ status }: { status: string }): React.ReactElement {
  const tone =
    status === "succeeded"
      ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200"
      : status === "failed"
        ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
        : status === "running"
          ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export function InboxTable({
  rows,
  entities,
  serverActions,
}: InboxTableProps): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleRow = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const clear = (): void => setSelected(new Set());

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
                aria-label="Select all receipts"
              />
            </TableHead>
            <TableHead className="w-14">Scan</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>OCR</TableHead>
            <TableHead>Uploaded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                Inbox is empty. Drop a receipt above.
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
                    aria-label={`Select receipt ${row.id}`}
                  />
                </TableCell>
                <TableCell>
                  {row.blob.contentType.startsWith("image/") ? (
                    <Image
                      src={`/api/blobs/${row.blob.id}`}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 rounded border object-cover"
                    />
                  ) : (
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded border text-[10px] uppercase">
                      PDF
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/intake/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.vendor ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.amount ?? "—"} {row.currency ?? ""}
                </TableCell>
                <TableCell>
                  {row.entityName ?? (row.isPersonal === "true" ? "Personal" : "—")}
                </TableCell>
                <TableCell>
                  <IntakeStatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <OcrPill status={row.ocrStatus} />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {row.uploadedAt.slice(0, 16).replace("T", " ")}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <MassActionsBar
        selectedIds={selectedIds}
        entities={entities}
        onClear={clear}
        {...serverActions}
      />
    </>
  );
}
