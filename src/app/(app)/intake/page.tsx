import Link from "next/link";
import Image from "next/image";

import { UploadDropzone } from "@/components/intake/UploadDropzone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listIntakeItems, type IntakeListRow } from "@/domains/intake";
import { cn } from "@/lib/utils";

import { IntakeStatusBadge } from "@/components/intake/IntakeStatusBadge";

export const dynamic = "force-dynamic";

function OcrBadge({ status }: { status: IntakeListRow["ocrStatus"] }): React.ReactElement {
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

interface IntakePageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function IntakePage({ searchParams }: IntakePageProps): Promise<React.ReactElement> {
  const { status } = await searchParams;
  const statuses = status
    ? (status.split(",").filter((s) =>
        ["new", "needs_review", "routed", "confirmed", "rejected"].includes(s),
      ) as IntakeListRow["status"][])
    : undefined;

  const rows = await listIntakeItems(getDb(), { statuses });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-muted-foreground text-sm">
          Receipts land here first. OCR runs automatically; you review, route, and confirm.
        </p>
      </header>

      <UploadDropzone />

      <div className="flex flex-wrap gap-1.5 text-xs">
        <FilterLink current={status} value={undefined} label="All" />
        <FilterLink current={status} value="needs_review" label="Needs review" />
        <FilterLink current={status} value="new" label="New" />
        <FilterLink current={status} value="routed" label="Routed" />
        <FilterLink current={status} value="confirmed" label="Confirmed" />
        <FilterLink current={status} value="rejected" label="Rejected" />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                Inbox is empty. Drop a receipt above.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const extraction = row.extraction as
                | {
                    vendor?: { value: string | null };
                    amount?: { value: string | null };
                    currency?: { value: string | null };
                    overallConfidence?: number;
                  }
                | null;
              const vendor = extraction?.vendor?.value ?? "—";
              const amount = extraction?.amount?.value ?? "—";
              const currency = extraction?.currency?.value ?? "";
              return (
                <TableRow key={row.id}>
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
                    <Link href={`/intake/${row.id}`} className="font-medium hover:underline">
                      {vendor}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {amount} {currency}
                  </TableCell>
                  <TableCell>{row.entityName ?? (row.isPersonal === "true" ? "Personal" : "—")}</TableCell>
                  <TableCell>
                    <IntakeStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <OcrBadge status={row.ocrStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}): React.ReactElement {
  const active = (current ?? "") === (value ?? "");
  const href = value ? `/intake?status=${value}` : "/intake";
  return (
    <Link
      href={href}
      className={cn(
        "rounded border px-2 py-0.5 transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
      )}
    >
      {label}
    </Link>
  );
}
