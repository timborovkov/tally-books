import type { Db } from "@/db/client";
import { categories } from "@/db/schema";
import type { DefaultCategory, JurisdictionConfig } from "@/lib/jurisdictions/types";

/**
 * Insert the jurisdiction's default categories as entity-scoped rows.
 *
 * Called from `createEntity` once per new entity. Each row is marked
 * with `metadata.seededFromJurisdictionDefault = <key>` so a future
 * "reset to defaults" UI can identify which rows came from the seed
 * (vs. user-added) and so this code itself can be made re-runnable
 * later. **Today this helper is NOT idempotent** — it does not check
 * for existing seeded rows before inserting, so calling it twice on
 * the same entity will create duplicates. The single caller
 * (`createEntity`) only fires once per entity, so this is fine for
 * v0.1; if a "reset to defaults" caller is added, gate inserts on a
 * `WHERE NOT EXISTS` check against the metadata marker.
 *
 * Bypasses the public `createCategory` mutation: we run inside
 * `createEntity`'s authorization context (the user already proved they
 * can create the entity) and `entity.created` is already audited, so
 * emitting one audit event per default would be noise.
 *
 * Topo-sorts by `parentKey` so a parent always inserts before its
 * children. Defaults reference each other by `key` (a stable slug from
 * the jurisdiction config), not by DB id, because the ids are
 * generated here.
 */
export async function seedDefaultCategoriesForEntity(
  tx: Db,
  entityId: string,
  jurisdictionConfig: JurisdictionConfig,
): Promise<number> {
  const defaults = jurisdictionConfig.defaultCategories;
  if (defaults.length === 0) return 0;

  const ordered = topoSortDefaults(defaults);

  // Track key → inserted id so children can resolve their parentId
  // from the jurisdiction-config-level parentKey reference.
  const idByKey = new Map<string, string>();
  let inserted = 0;

  for (const def of ordered) {
    const parentId = def.parentKey ? (idByKey.get(def.parentKey) ?? null) : null;
    const [row] = await tx
      .insert(categories)
      .values({
        scope: "entity",
        entityId,
        name: def.name,
        kind: def.kind,
        code: def.code ?? null,
        parentId,
        metadata: { seededFromJurisdictionDefault: def.key },
      })
      .returning({ id: categories.id });
    if (!row) throw new Error(`failed to insert default category ${def.key}`);
    idByKey.set(def.key, row.id);
    inserted += 1;
  }

  return inserted;
}

/**
 * Stable topological sort: parents before children, original order
 * otherwise. Throws on a missing parentKey or a cycle so a malformed
 * jurisdiction config fails loud instead of silently dropping rows.
 */
function topoSortDefaults(defaults: readonly DefaultCategory[]): DefaultCategory[] {
  const byKey = new Map<string, DefaultCategory>();
  for (const def of defaults) {
    if (byKey.has(def.key)) {
      throw new Error(`duplicate default category key: ${def.key}`);
    }
    byKey.set(def.key, def);
  }

  const result: DefaultCategory[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const visit = (def: DefaultCategory): void => {
    if (placed.has(def.key)) return;
    if (visiting.has(def.key)) {
      throw new Error(`cycle in default categories at key: ${def.key}`);
    }
    visiting.add(def.key);
    if (def.parentKey) {
      const parent = byKey.get(def.parentKey);
      if (!parent) {
        throw new Error(
          `default category ${def.key} references unknown parentKey: ${def.parentKey}`,
        );
      }
      visit(parent);
    }
    visiting.delete(def.key);
    placed.add(def.key);
    result.push(def);
  };

  for (const def of defaults) visit(def);
  return result;
}
