import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceForm } from "@/components/settings/InvoiceForm";
import { InvoicePdfDownloadButton } from "@/components/settings/InvoicePdfDownloadButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlagBadges } from "@/components/versioning/FlagBadges";
import { StateBadge } from "@/components/versioning/StateBadge";
import { VersionTimeline } from "@/components/versioning/VersionTimeline";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { NotFoundError } from "@/domains/errors";
import {
  getInvoice,
  getInvoiceAuditEntries,
  getInvoiceHistory,
  parseLineItems,
} from "@/domains/invoices";
import { listParties } from "@/domains/parties";
import { canTransition } from "@/lib/versioning";
import { INVOICE_TRANSITION_TARGETS } from "@/lib/versioning/state-machine";

import {
  downloadInvoicePdfAction,
  markInvoicePaidAction,
  markInvoiceUnpaidAction,
  transitionInvoiceAction,
  updateInvoiceAction,
} from "../actions";

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const db = getDb();

  let invoice;
  try {
    invoice = await getInvoice(db, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [entities, parties, history, audit] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listParties(db),
    getInvoiceHistory(db, id),
    getInvoiceAuditEntries(db, id),
  ]);

  const allowedTargets = INVOICE_TRANSITION_TARGETS.filter((to) =>
    canTransition(invoice.state, to, { thingType: "invoice" }),
  );

  const initialLineItems = parseLineItems(invoice.lineItems);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{invoice.number ?? "Draft invoice"}</h1>
            <StateBadge state={invoice.state} />
            {invoice.paidAt ? <Badge>paid</Badge> : <Badge variant="outline">unpaid</Badge>}
            {invoice.mirrorInvoiceId ? <Badge variant="secondary">mirror</Badge> : null}
            <FlagBadges
              autoRefreshLocked={invoice.autoRefreshLocked}
              refreshPending={invoice.refreshPending}
              underlyingDataChanged={invoice.underlyingDataChanged}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {invoice.entityName}
            {invoice.clientName ? ` → ${invoice.clientName}` : ""}
            {invoice.mirrorEntityName ? ` · mirror of ${invoice.mirrorEntityName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InvoicePdfDownloadButton invoiceId={invoice.id} download={downloadInvoicePdfAction} />
          {invoice.mirrorInvoiceId ? (
            <Button variant="outline" asChild>
              <Link href={`/settings/invoices/${invoice.mirrorInvoiceId}`}>Mirror →</Link>
            </Button>
          ) : null}
          <Button variant="ghost" asChild>
            <Link href="/settings/invoices">Back</Link>
          </Button>
        </div>
      </header>

      <InvoiceForm
        entities={entities}
        parties={parties}
        invoice={invoice}
        initialLineItems={initialLineItems}
        action={updateInvoiceAction}
        submitLabel="Save changes"
      />

      <section className="grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">Lifecycle</h2>
          {allowedTargets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transitions available.</p>
          ) : (
            <form action={transitionInvoiceAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={invoice.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nextState">Next state</Label>
                <Select name="nextState" defaultValue={allowedTargets[0]}>
                  <SelectTrigger id="nextState">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedTargets.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filedRef">Filed reference (optional)</Label>
                <Input id="filedRef" name="filedRef" placeholder="Portal id, e-invoice ref…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Input id="reason" name="reason" />
              </div>
              <Button type="submit" variant="outline">
                Transition
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">Payment</h2>
          {invoice.paidAt ? (
            <>
              <p className="text-sm">
                Marked paid {invoice.paidAt.toISOString().slice(0, 10)}
                {invoice.paymentRef ? ` · ${invoice.paymentRef}` : ""}.
              </p>
              <form action={markInvoiceUnpaidAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={invoice.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason-unpay">Reason</Label>
                  <Input id="reason-unpay" name="reason" placeholder="Optional" />
                </div>
                <Button type="submit" variant="outline">
                  Mark unpaid
                </Button>
              </form>
            </>
          ) : (
            <form action={markInvoicePaidAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={invoice.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paidAt">Date paid</Label>
                <Input id="paidAt" name="paidAt" type="date" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paymentRef">Payment reference</Label>
                <Input id="paymentRef" name="paymentRef" placeholder="Bank tx, stripe ch_…" />
              </div>
              <Button type="submit">Mark paid</Button>
            </form>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="text-lg font-semibold">Version timeline</h2>
        <VersionTimeline
          versions={history.map((h) => ({
            version: {
              id: h.version.id,
              versionNum: h.version.versionNum,
              stateSnapshot: h.version.stateSnapshot,
              diff: h.version.diff,
              semanticSummary: h.version.semanticSummary,
              actorKind: h.version.actorKind,
              createdAt: h.version.createdAt,
            },
            actor: h.actor,
          }))}
          auditEntries={audit}
        />
      </section>
    </div>
  );
}
