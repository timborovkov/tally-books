import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, type Category } from "@/db/schema";

import { NotFoundError } from "../errors";

export interface ListCategoriesOptions {
  /** Restrict to entity-scoped categories for this entity (plus `global`). */
  entityId?: string;
  kind?: "income" | "expense" | "asset" | "liability" | "equity";
  includeArchived?: boolean;
}

/**
 * The list-page hot path. By default returns `global` rows + the
 * requested entity's `entity` rows. Personal-scoped rows are NOT
 * included unless the caller explicitly asks for them by passing the
 * personal pseudo-entity id (handled by the entity layer).
 */
export async function listCategories(
  db: Db,
  opts: ListCategoriesOptions = {},
): Promise<Category[]> {
  const filters: SQL[] = [];
  if (opts.entityId) {
    const scopeFilter = or(
      eq(categories.scope, "global"),
      and(eq(categories.scope, "entity"), eq(categories.entityId, opts.entityId)),
    );
    if (scopeFilter) filters.push(scopeFilter);
  }
  if (opts.kind) filters.push(eq(categories.kind, opts.kind));
  if (!opts.includeArchived) filters.push(isNull(categories.archivedAt));

  return db
    .select()
    .from(categories)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(categories.name));
}

export async function getCategory(db: Db, id: string): Promise<Category> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!row) throw new NotFoundError("category", id);
  return row;
}
