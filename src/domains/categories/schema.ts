import { z } from "zod";

const categoryScope = z.enum(["entity", "personal", "global"]);
const categoryKind = z.enum(["income", "expense", "asset", "liability", "equity"]);

/**
 * Category create/update inputs. Categories are mutable config — no
 * versioning, no concurrency guard. The scope/entityId biconditional
 * is enforced both in the DB CHECK and re-checked here so the error
 * surfaces as a domain ValidationError instead of a raw 23514.
 */
export const createCategoryInput = z
  .object({
    scope: categoryScope,
    entityId: z.string().min(1).nullable().optional(),
    name: z.string().min(1).max(120),
    parentId: z.string().min(1).nullable().optional(),
    kind: categoryKind,
    code: z.string().max(50).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => (v.scope === "entity") === Boolean(v.entityId), {
    message: "entityId must be set iff scope='entity'",
    path: ["entityId"],
  });

export type CreateCategoryInput = z.input<typeof createCategoryInput>;

export const updateCategoryInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().min(1).nullable().optional(),
  code: z.string().max(50).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // Archive toggle — pass `archive: true` to set archivedAt=now, `false`
  // to clear it. Omit to leave unchanged.
  archive: z.boolean().optional(),
});

export type UpdateCategoryInput = z.input<typeof updateCategoryInput>;
