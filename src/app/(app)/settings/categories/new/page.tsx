import Link from "next/link";

import { CategoryForm } from "@/components/settings/CategoryForm";
import { getDb } from "@/db/client";
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";

import { createCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const db = getDb();
  const [entities, parents] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db, { kind: "expense" }),
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
