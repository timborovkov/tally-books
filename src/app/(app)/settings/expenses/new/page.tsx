import Link from "next/link";

import { ExpenseForm } from "@/components/settings/ExpenseForm";
import { getDb } from "@/db/client";
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";

import { createExpenseAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  const db = getDb();
  // listCategories with no entityId returns every non-archived
  // expense-kind category — entity-scoped, personal, and global. The
  // form picks the entity at creation; on submit the domain layer
  // validates that the chosen category belongs to the chosen entity
  // (or is global). Showing all of them up front keeps the picker
  // simple — narrowing by entity would require a client-side fetch
  // round trip.
  const [entities, categoriesRaw] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db, { kind: "expense" }),
  ]);
  const categories = [...categoriesRaw].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-muted-foreground mb-1 text-xs">
          <Link href="/settings/expenses" className="hover:underline">
            Expenses
          </Link>{" "}
          · New
        </div>
        <h1 className="text-2xl font-semibold">New expense</h1>
      </div>
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
        expense={null}
        action={createExpenseAction}
        submitLabel="Create expense"
      />
    </div>
  );
}
