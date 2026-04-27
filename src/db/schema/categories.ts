import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { categoryKindEnum, categoryScopeEnum } from "./enums";
import { entities } from "./entities";

/**
 * Chart-of-accounts-style categories. docs/data-model.md §7.3.
 *
 * Not versioned — categories are mutable config, not source artifacts.
 * Soft-delete via `archived_at`; never hard-delete because rows in
 * `expenses.category_id` (and future `invoices.category_id`,
 * `bank_transactions.category_id`) FK at us with ON DELETE RESTRICT,
 * and breaking those references would orphan accounting history.
 *
 * `parent_id` is a self-reference. Drizzle resolves it at runtime via
 * the lazy callback so the table can be defined in a single file
 * without a forward-declaration dance. Cycles are prevented in the
 * domain layer (mutations reject if the new parent_id is in the
 * descendant set).
 */
export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    scope: categoryScopeEnum("scope").notNull(),
    // Set only when scope='entity'. The CHECK below enforces the
    // biconditional so personal/global rows can't accidentally point
    // at an entity (and entity rows can't be unscoped).
    entityId: text("entity_id").references(() => entities.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Self-reference resolved lazily so `categories` is in scope by
    // the time the callback fires. The eslint disable is the standard
    // Drizzle escape hatch — `references()` cannot be typed against a
    // column that doesn't exist yet at parse time. Used the same way
    // by self-referential schemas across the Drizzle ecosystem.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parentId: text("parent_id").references((): any => categories.id, { onDelete: "restrict" }),
    kind: categoryKindEnum("kind").notNull(),
    code: text("code"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "categories_entity_scope_match",
      sql`(${t.scope} = 'entity') = (${t.entityId} IS NOT NULL)`,
    ),
    index("categories_scope_entity_idx").on(t.scope, t.entityId),
    index("categories_parent_idx").on(t.parentId),
    // The list page's hot path: pick a kind for an entity, hide archived.
    index("categories_entity_kind_active_idx")
      .on(t.entityId, t.kind, t.archivedAt)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
