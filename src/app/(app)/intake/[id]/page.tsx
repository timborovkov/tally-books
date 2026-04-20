import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfidenceField } from "@/components/intake/ConfidenceField";
import { IntakeStatusBadge } from "@/components/intake/IntakeStatusBadge";
import { RoutingPanel } from "@/components/intake/RoutingPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { NotFoundError } from "@/domains/errors";
import { getIntakeAuditEntries, getIntakeItem } from "@/domains/intake";
import type { ReceiptExtraction } from "@/lib/ai";

import {
  confirmIntakeAction,
  reExtractIntakeAction,
  rejectIntakeAction,
  reRouteIntakeAction,
} from "../actions";

export const dynamic = "force-dynamic";

interface IntakeDetailProps {
  params: Promise<{ id: string }>;
}

export default async function IntakeDetailPage({
  params,
}: IntakeDetailProps): Promise<React.ReactElement> {
  const { id } = await params;
  const db = getDb();

  let item;
  try {
    item = await getIntakeItem(db, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [entities, audit] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    getIntakeAuditEntries(db, id),
  ]);

  const extraction = (item.extraction as ReceiptExtraction | null) ?? null;

  const isTerminal = item.status === "confirmed" || item.status === "rejected";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/intake" className="hover:underline">
              Inbox
            </Link>{" "}
            · {item.uploadedAt.toISOString().slice(0, 10)}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {extraction?.vendor.value ?? "Untitled receipt"}
            <IntakeStatusBadge status={item.status} />
          </h1>
          {item.ocrError && (
            <p className="mt-2 rounded border border-red-500/50 bg-red-50 px-2 py-1 text-xs text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
              OCR failed: {item.ocrError}
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Scan preview */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Scan</h2>
          <div className="bg-muted/40 flex items-center justify-center rounded-md border p-2">
            {item.blob.contentType.startsWith("image/") ? (
              <Image
                src={`/api/blobs/${item.blob.id}`}
                alt="receipt scan"
                width={600}
                height={800}
                unoptimized
                className="max-h-[640px] w-auto rounded"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-10 text-sm">
                <span className="bg-muted rounded border px-3 py-1 font-mono text-xs uppercase">
                  PDF
                </span>
                <a
                  href={`/api/blobs/${item.blob.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open full document
                </a>
              </div>
            )}
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
            <span>Content type: {item.blob.contentType}</span>
            <span>Size: {(item.blob.sizeBytes / 1024).toFixed(1)} KB</span>
            <span className="font-mono">sha256: {item.blob.sha256.slice(0, 12)}…</span>
          </div>
        </section>

        {/* Review + route + confirm */}
        <section className="flex flex-col gap-6">
          <RoutingPanel
            item={item}
            entities={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
            isTerminal={isTerminal}
          />

          <form
            action={isTerminal ? undefined : confirmIntakeAction}
            className="border-border flex flex-col gap-4 rounded-md border p-4"
          >
            <input type="hidden" name="id" value={item.id} />
            <h2 className="text-sm font-semibold">Extracted fields</h2>
            <p className="text-muted-foreground text-xs">
              Low-confidence fields are highlighted. Edit before confirming — the values
              here populate the created receipt.
            </p>

            <ConfidenceField
              label="Vendor"
              name="vendor"
              defaultValue={extraction?.vendor.value ?? ""}
              confidence={extraction?.vendor.confidence}
              required
              disabled={isTerminal}
            />
            <ConfidenceField
              label="Date"
              type="date"
              name="occurredAt"
              defaultValue={
                extraction?.occurredAt.value
                  ? extraction.occurredAt.value.slice(0, 10)
                  : ""
              }
              confidence={extraction?.occurredAt.confidence}
              required
              disabled={isTerminal}
            />
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <ConfidenceField
                label="Amount"
                name="amount"
                defaultValue={extraction?.amount.value ?? ""}
                confidence={extraction?.amount.confidence}
                placeholder="12.50"
                required
                disabled={isTerminal}
              />
              <ConfidenceField
                label="Currency"
                name="currency"
                defaultValue={extraction?.currency.value ?? ""}
                confidence={extraction?.currency.confidence}
                placeholder="EUR"
                maxLength={3}
                required
                disabled={isTerminal}
              />
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                name="notes"
                defaultValue={extraction?.notes ?? ""}
                maxLength={2000}
                disabled={isTerminal}
              />
            </div>

            {!isTerminal && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit">Confirm &amp; create receipt</Button>
              </div>
            )}
          </form>

          {!isTerminal && (
            <div className="border-border flex flex-col gap-3 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Other actions</h2>
              <div className="flex flex-wrap gap-2">
                <form action={reExtractIntakeAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Re-run OCR
                  </Button>
                </form>
                <form action={rejectIntakeAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          )}

          {item.status === "confirmed" && (
            <div className="border-border flex flex-col gap-3 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Wrong route?</h2>
              <p className="text-muted-foreground text-xs">
                Re-route voids the current receipt, resets this item to needs-review,
                and preserves the prior routing in the audit trail.
              </p>
              <RoutingPanel
                item={item}
                entities={entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
                reRouteAction={reRouteIntakeAction}
              />
            </div>
          )}
        </section>
      </div>

      {audit.length > 0 && (
        <section className="border-border flex flex-col gap-2 rounded-md border p-4">
          <h2 className="text-sm font-semibold">Audit trail</h2>
          <ul className="flex flex-col gap-1 text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex gap-3 font-mono">
                <span className="text-muted-foreground">{a.at.toISOString()}</span>
                <span>{a.action}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
