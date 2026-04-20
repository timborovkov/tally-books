import Link from "next/link";
import { notFound } from "next/navigation";

import { ReceiptForm } from "@/components/settings/ReceiptForm";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlagBadges } from "@/components/versioning/FlagBadges";
import { StateBadge } from "@/components/versioning/StateBadge";
import { VersionTimeline } from "@/components/versioning/VersionTimeline";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import {
  getReceipt,
  getReceiptAuditEntries,
  getReceiptHistory,
} from "@/domains/receipts";
import { assertPeriodUnlocked, canTransition } from "@/lib/versioning";
import { RECEIPT_TRANSITION_TARGETS } from "@/lib/versioning/state-machine";
import { NotFoundError } from "@/domains/errors";
import { getCurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";

import { transitionReceiptAction, updateReceiptAction } from "../actions";

export const dynamic = "force-dynamic";

interface ReceiptDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReceiptDetailPage({ params }: ReceiptDetailPageProps) {
  const { id } = await params;
  const db = getDb();

  // Narrow catch — only swallow NotFoundError so a connection / permission
  // failure surfaces as a real 500 instead of a misleading 404.
  let receipt;
  try {
    receipt = await getReceipt(db, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  // Authz on the point read: user must have receipts:read for this
  // entity. PermissionDeniedError falls through to the framework's 500
  // handler today; when non-admin surfaces ship we may want a dedicated
  // 403 page.
  const actor = await getCurrentActor(db);
  await assertCan(actor.user, "receipts", "read", { entityId: receipt.entityId });

  const [entities, history, audit, inPeriodLock] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    getReceiptHistory(db, id),
    getReceiptAuditEntries(db, id),
    assertPeriodUnlocked(db, {
      entityId: receipt.entityId,
      occurredAt: receipt.occurredAt,
    })
      .then(() => false)
      .catch(() => true),
  ]);

  const allowedStates = RECEIPT_TRANSITION_TARGETS.filter((s) =>
    canTransition(receipt.state, s, { thingType: "receipt" }),
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/settings/receipts" className="hover:underline">
              Receipts
            </Link>{" "}
            · {receipt.occurredAt.toISOString().slice(0, 10)}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {receipt.vendor}
            <StateBadge state={receipt.state} />
          </h1>
          <div className="mt-2">
            <FlagBadges
              underlyingDataChanged={receipt.underlyingDataChanged}
              autoRefreshLocked={receipt.autoRefreshLocked}
              refreshPending={receipt.refreshPending}
              inPeriodLock={inPeriodLock}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-8">
          <ReceiptForm
            entities={entities.map((e) => ({
              id: e.id,
              name: e.name,
              baseCurrency: e.baseCurrency,
            }))}
            receipt={receipt}
            action={updateReceiptAction}
            submitLabel="Save changes"
          />

          {allowedStates.length > 0 ? (
            <div className="border-border flex flex-col gap-3 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Transition state</h2>
              <form action={transitionReceiptAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={receipt.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nextState">New state</Label>
                  <Select name="nextState" defaultValue={allowedStates[0]}>
                    <SelectTrigger id="nextState">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedStates.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filedRef">Filed reference (optional)</Label>
                  <Input
                    id="filedRef"
                    name="filedRef"
                    maxLength={200}
                    placeholder="Portal reference, only meaningful for filed"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Input id="reason" name="reason" maxLength={500} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="outline">
                    Apply transition
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">History</h2>
          <VersionTimeline versions={history} auditEntries={audit} />
        </aside>
      </div>
    </div>
  );
}
