import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, type Category } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { CurrentActor } from "@/lib/auth-shim";
import { assertCan } from "@/lib/iam/permissions";
import { assertReturning } from "@/lib/versioning";

import { ConflictError, NotFoundError, ValidationError } from "../errors";

import {
  createCategoryInput,
  updateCategoryInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "./schema";

/**
 * Walk up `parent_id` from `startId` and return true if `targetId` is
 * reached. Used to reject a parent reassignment that would create a
 * cycle. Bounded loop — categories can't realistically nest more than
 * a handful of levels, but we cap at 100 hops as a defensive ceiling
 * in case data ever drifts.
 */
async function isAncestor(db: Db, startId: string, targetId: string): Promise<boolean> {
  let cursor: string | null = startId;
  for (let i = 0; i < 100 && cursor; i++) {
    if (cursor === targetId) return true;
    const [row] = await db
      .select({ parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor))
      .limit(1);
    if (!row) return false;
    cursor = row.parentId;
  }
  return false;
}

export async function createCategory(
  db: Db,
  actor: CurrentActor,
  raw: CreateCategoryInput,
): Promise<Category> {
  const input = createCategoryInput.parse(raw);
  // Scope-based authz: entity-scoped categories require write on the
  // owning entity; personal/global require write with no scope (admin
  // wildcard, or a global grant).
  await assertCan(
    db,
    actor.user,
    "categories",
    "write",
    input.scope === "entity" ? { entityId: input.entityId! } : {},
  );

  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, input.parentId))
      .limit(1);
    if (!parent) throw new NotFoundError("category", input.parentId);
    if (parent.kind !== input.kind) {
      throw new ValidationError("parent category must share kind", {
        parentKind: parent.kind,
        kind: input.kind,
      });
    }
  }

  const row = assertReturning(
    (
      await db
        .insert(categories)
        .values({
          scope: input.scope,
          entityId: input.entityId ?? null,
          name: input.name,
          parentId: input.parentId ?? null,
          kind: input.kind,
          code: input.code ?? null,
          metadata: input.metadata ?? {},
        })
        .returning()
    )[0],
    "category insert",
  );

  await recordAudit(db, {
    actorId: actor.userId,
    actorKind: actor.kind,
    action: "category.created",
    payload: { categoryId: row.id, scope: row.scope, kind: row.kind },
  });

  return row;
}

export async function updateCategory(
  db: Db,
  actor: CurrentActor,
  raw: UpdateCategoryInput,
): Promise<Category> {
  const input = updateCategoryInput.parse(raw);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, input.id))
      .for("update")
      .limit(1);
    if (!existing) throw new NotFoundError("category", input.id);

    await assertCan(
      tx,
      actor.user,
      "categories",
      "write",
      existing.scope === "entity" ? { entityId: existing.entityId! } : {},
    );

    // Cycle prevention: the new parent must not be a descendant of this
    // category. `isAncestor(parent, self)` answering true would mean
    // walking up from the new parent reaches self → reparenting closes
    // a loop. Self-as-own-parent is also blocked.
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === input.id) {
        throw new ConflictError("category cannot be its own parent", { id: input.id });
      }
      if (await isAncestor(tx, input.parentId, input.id)) {
        throw new ConflictError("parent reassignment would create a cycle", {
          id: input.id,
          newParentId: input.parentId,
        });
      }
      const [newParent] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, input.parentId))
        .limit(1);
      if (!newParent) throw new NotFoundError("category", input.parentId);
      if (newParent.kind !== existing.kind) {
        throw new ValidationError("parent category must share kind", {
          parentKind: newParent.kind,
          kind: existing.kind,
        });
      }
    }

    const patch: Partial<typeof categories.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    if (input.code !== undefined) patch.code = input.code;
    if (input.metadata !== undefined) patch.metadata = input.metadata;
    if (input.archive !== undefined) {
      patch.archivedAt = input.archive ? new Date() : null;
    }

    const row = assertReturning(
      (await tx.update(categories).set(patch).where(eq(categories.id, input.id)).returning())[0],
      "category update",
    );

    await recordAudit(tx, {
      actorId: actor.userId,
      actorKind: actor.kind,
      action: input.archive === true ? "category.archived" : "category.updated",
      payload: { categoryId: row.id },
    });

    return row;
  });
}
