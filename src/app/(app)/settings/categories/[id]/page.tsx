import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryForm } from "@/components/settings/CategoryForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { getCategory, listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";
import { NotFoundError } from "@/domains/errors";

import { archiveCategoryAction, updateCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

interface CategoryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const { id } = await params;
  const db = getDb();

  let category;
  try {
    category = await getCategory(db, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [entities, parents] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db, {
      entityId: category.entityId ?? undefined,
      kind: category.kind,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/settings/categories" className="hover:underline">
              Categories
            </Link>{" "}
            · {category.scope}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {category.name}
            {category.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
          </h1>
        </div>
        <form action={archiveCategoryAction}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="archive" value={category.archivedAt ? "false" : "true"} />
          <Button type="submit" variant="outline" size="sm">
            {category.archivedAt ? "Unarchive" : "Archive"}
          </Button>
        </form>
      </header>

      <CategoryForm
        entities={entities.map((e) => ({ id: e.id, name: e.name }))}
        parentCandidates={parents.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          scope: c.scope,
        }))}
        category={category}
        action={updateCategoryAction}
        submitLabel="Save changes"
      />
    </div>
  );
}
