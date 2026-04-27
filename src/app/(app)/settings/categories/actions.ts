"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { createCategory, updateCategory } from "@/domains/categories";
import { getCurrentActor } from "@/lib/auth-shim";
import { str, strOrNull } from "@/lib/form-helpers";

function parseScope(raw: string): "entity" | "personal" | "global" {
  if (raw === "entity" || raw === "personal" || raw === "global") return raw;
  throw new Error(`Unknown scope: ${raw}`);
}

function parseKind(raw: string): "income" | "expense" | "asset" | "liability" | "equity" {
  if (
    raw === "income" ||
    raw === "expense" ||
    raw === "asset" ||
    raw === "liability" ||
    raw === "equity"
  ) {
    return raw;
  }
  throw new Error(`Unknown kind: ${raw}`);
}

export async function createCategoryAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const scope = parseScope(str(form, "scope"));

  const created = await createCategory(db, actor, {
    scope,
    entityId: scope === "entity" ? str(form, "entityId") : null,
    name: str(form, "name"),
    parentId: strOrNull(form, "parentId"),
    kind: parseKind(str(form, "kind")),
    code: strOrNull(form, "code"),
  });

  revalidatePath("/settings/categories");
  redirect(`/settings/categories/${created.id}`);
}

export async function updateCategoryAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");

  await updateCategory(db, actor, {
    id,
    name: str(form, "name"),
    parentId: strOrNull(form, "parentId"),
    code: strOrNull(form, "code"),
  });

  revalidatePath("/settings/categories");
  revalidatePath(`/settings/categories/${id}`);
}

export async function archiveCategoryAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const archive = form.get("archive") !== "false";

  await updateCategory(db, actor, { id, archive });

  revalidatePath("/settings/categories");
  revalidatePath(`/settings/categories/${id}`);
}
