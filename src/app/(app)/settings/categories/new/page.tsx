import Link from "next/link";

import { CategoryForm } from "@/components/settings/CategoryForm";
import { getDb } from "@/db/client";
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";

import { createCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const db = getDb();
  // Fetch parent candidates across all kinds — the user hasn't picked a
  // kind yet, and the form lets them choose any of the five. Filtering
  // here to a single kind would lock out non-expense parents (cursor
  // review caught this). The form labels each option with its kind so
  // the user picks one that matches their selection; domain layer
  // (createCategory → parent.kind === input.kind) is the authoritative
  // gate either way.
  const [entities, parents] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-muted-foreground mb-1 text-xs">
          <Link href="/settings/categories" className="hover:underline">
            Categories
          </Link>{" "}
          · New
        </div>
        <h1 className="text-2xl font-semibold">New category</h1>
      </div>
      <CategoryForm
        entities={entities.map((e) => ({ id: e.id, name: e.name }))}
        parentCandidates={parents.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          scope: c.scope,
        }))}
        category={null}
        action={createCategoryAction}
        submitLabel="Create category"
      />
    </div>
  );
}
