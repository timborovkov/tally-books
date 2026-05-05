import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { blobs } from "./blobs";
import { documentKindEnum, documentOwnerTypeEnum } from "./enums";
import { entities } from "./entities";

/**
 * Generic document store — contracts, addenda, government mail, filings,
 * insurance policies, identification scans, anything attached to a Thing.
 * docs/data-model.md §7.2.
 *
 * Not versioned. External artifacts get replaced (upload a new revision)
 * rather than edited in place; the contract from last year and this
 * year's renewal are two rows, not two versions of one row. Soft-delete
 * via `archived_at`.
 *
 * `(owner_type, owner_id)` is polymorphic — a contract attaches to a
 * `party` (employment / supplier contract), a `person` (NDAs etc.), or
 * an `entity` (incorporation papers, bylaws). No FK on `owner_id`
 * because the target table varies; the service layer validates the
 * owner exists when the document is created.
 *
 * `entity_id` is nullable — global documents (a generic NDA template,
 * for instance) live without an entity scope. When set, IAM checks scope
 * the document by entity.
 */
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    entityId: text("entity_id").references(() => entities.id, { onDelete: "restrict" }),
    kind: documentKindEnum("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // ON DELETE RESTRICT: deleting a blob that's still referenced by
    // a document must go through a domain flow (archive the document
    // first), not a cascade that silently drops the only paper trail.
    blobId: text("blob_id")
      .notNull()
      .references(() => blobs.id, { onDelete: "restrict" }),
    ownerType: documentOwnerTypeEnum("owner_type").notNull(),
    // No FK — owner table varies (parties / persons / entities). Service
    // layer validates existence at write time.
    ownerId: text("owner_id").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Hot path on the entity documents page: list a kind, newest first.
    index("documents_entity_kind_created_idx").on(t.entityId, t.kind, t.createdAt.desc()),
    // Hot path for "all documents attached to this party / person".
    index("documents_owner_idx").on(t.ownerType, t.ownerId),
    index("documents_active_idx")
      .on(t.archivedAt)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
