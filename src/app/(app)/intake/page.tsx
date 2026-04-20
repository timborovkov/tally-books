import Link from "next/link";

import { InboxTable, type InboxRow } from "@/components/intake/InboxTable";
import { UploadDropzone } from "@/components/intake/UploadDropzone";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { listIntakeItems, type IntakeListRow } from "@/domains/intake";
import { cn } from "@/lib/utils";

import {
  bulkAttachAction,
  bulkMarkPersonalAction,
  bulkRejectAction,
  bulkRequestEvidenceAction,
  bulkRouteAction,
  reExtractIntakeAction,
} from "./actions";

export const dynamic = "force-dynamic";

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

  const db = getDb();
  const [rawRows, entities] = await Promise.all([
    listIntakeItems(db, { statuses }),
    listEntities(db, { includeArchived: false }),
  ]);

  // Narrow projection for the client table so jsonb payloads don't
  // cross the server/client boundary.
  const rows: InboxRow[] = rawRows.map((r) => {
    const extraction = r.extraction as
      | {
          vendor?: { value: string | null };
          amount?: { value: string | null };
          currency?: { value: string | null };
        }
      | null;
    return {
      id: r.id,
      uploadedAt: r.uploadedAt.toISOString(),
      status: r.status,
      ocrStatus: r.ocrStatus,
      entityName: r.entityName,
      isPersonal: r.isPersonal,
      vendor: extraction?.vendor?.value ?? null,
      amount: extraction?.amount?.value ?? null,
      currency: extraction?.currency?.value ?? null,
      blob: {
        id: r.blob.id,
        contentType: r.blob.contentType,
      },
    };
  });

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

      <InboxTable
        rows={rows}
        entities={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
        serverActions={{
          bulkRoute: bulkRouteAction,
          bulkMarkPersonal: bulkMarkPersonalAction,
          bulkReExtract: reExtractIntakeAction,
          bulkReject: bulkRejectAction,
          bulkAttach: bulkAttachAction,
          bulkRequestEvidence: bulkRequestEvidenceAction,
        }}
      />
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
