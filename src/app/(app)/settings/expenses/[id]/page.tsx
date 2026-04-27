import Link from "next/link";
import { notFound } from "next/navigation";

import { ExpenseForm } from "@/components/settings/ExpenseForm";
import { ReceiptLinker } from "@/components/settings/ReceiptLinker";
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
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";
import { NotFoundError } from "@/domains/errors";
import { getExpense, getExpenseAuditEntries, getExpenseHistory } from "@/domains/expenses";
import { getCurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";
import { assertPeriodUnlocked, canTransition, PeriodLockedError } from "@/lib/versioning";
import { BASE_TRANSITION_TARGETS } from "@/lib/versioning/state-machine";

import {
  linkReceiptAction,
  markReimbursedAction,
  searchReceiptsAction,
  transitionExpenseAction,
  updateExpenseAction,
} from "../actions";

export const dynamic = "force-dynamic";

interface ExpenseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
  const { id } = await params;
  const db = getDb();

  let expense;
  try {
    expense = await getExpense(db, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const actor = await getCurrentActor(db);
  await assertCan(db, actor.user, "expenses", "read", { entityId: expense.entityId });

  const [entities, categories, history, audit, inPeriodLock] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db, { entityId: expense.entityId, kind: "expense" }),
    getExpenseHistory(db, id),
    getExpenseAuditEntries(db, id),
    assertPeriodUnlocked(db, {
      entityId: expense.entityId,
      occurredAt: expense.occurredAt,
    })
      .then(() => false)
      .catch((err: unknown) => {
        if (err instanceof PeriodLockedError) return true;
        throw err;
      }),
  ]);

  const allowedStates = BASE_TRANSITION_TARGETS.filter((s) =>
    canTransition(expense.state, s, { thingType: "expense" }),
  );

  const showMarkReimbursed =
    expense.paidBy === "personal_reimbursable" && expense.reimbursementStatus === "pending";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/settings/expenses" className="hover:underline">
              Expenses
            </Link>{" "}
            · {expense.occurredAt.toISOString().slice(0, 10)}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {expense.vendor ?? "Untitled expense"}
            <StateBadge state={expense.state} />
            {expense.paidBy === "personal_reimbursable" ? (
              <Badge
                variant={expense.reimbursementStatus === "paid_back" ? "default" : "destructive"}
              >
                {expense.reimbursementStatus === "paid_back" ? "Reimbursed" : "Owed back"}
              </Badge>
            ) : null}
          </h1>
          <div className="mt-2">
            <FlagBadges
              underlyingDataChanged={expense.underlyingDataChanged}
              autoRefreshLocked={expense.autoRefreshLocked}
              refreshPending={expense.refreshPending}
              inPeriodLock={inPeriodLock}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-8">
          <ExpenseForm
            entities={entities.map((e) => ({
              id: e.id,
              name: e.name,
              baseCurrency: e.baseCurrency,
            }))}
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              scope: c.scope,
              entityId: c.entityId,
            }))}
            expense={expense}
            action={updateExpenseAction}
            submitLabel="Save changes"
          />

          <div className="border-border flex flex-col gap-3 rounded-md border p-4">
            <h2 className="text-sm font-semibold">Linked receipt</h2>
            <ReceiptLinker
              expenseId={expense.id}
              entityId={expense.entityId}
              currentLink={
                expense.linkedReceiptId
                  ? {
                      id: expense.linkedReceiptId,
                      vendor: expense.linkedReceiptVendor ?? "(unknown)",
                      occurredAt: expense.linkedReceiptOccurredAt?.toISOString() ?? null,
                    }
                  : null
              }
              linkAction={linkReceiptAction}
              searchAction={searchReceiptsAction}
            />
          </div>

          {showMarkReimbursed ? (
            <div className="border-border flex flex-col gap-3 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Reimbursement</h2>
              <p className="text-muted-foreground text-xs">
                Mark this expense as paid back once the entity has reimbursed the user.
                Bank-transaction linking will replace this manual step in v0.3.
              </p>
              <form action={markReimbursedAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={expense.id} />
                <Input name="reason" maxLength={500} placeholder="Reason (optional)" />
                <div className="flex justify-end">
                  <Button type="submit" variant="outline">
                    Mark reimbursed
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {allowedStates.length > 0 ? (
            <div className="border-border flex flex-col gap-3 rounded-md border p-4">
              <h2 className="text-sm font-semibold">Transition state</h2>
              <form action={transitionExpenseAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={expense.id} />
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
