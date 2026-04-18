"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import {
  archiveEntity,
  createEntity,
  linkPersonToEntity,
  unarchiveEntity,
  unlinkPersonFromEntity,
  updateEntity,
} from "@/domains/entities";
import { getCurrentActor } from "@/lib/auth-shim";
import { int, str, strOrNull } from "@/lib/form-helpers";

function buildAddress(form: FormData): Record<string, string> {
  const fields = ["line1", "line2", "city", "region", "postcode", "country"] as const;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = form.get(`address_${f}`);
    if (typeof v === "string" && v.trim() !== "") out[f] = v;
  }
  return out;
}

export async function createEntityAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const created = await createEntity(db, actor, {
    kind: str(form, "kind") as "legal" | "personal",
    name: str(form, "name"),
    entityType: strOrNull(form, "entityType"),
    jurisdictionId: str(form, "jurisdictionId"),
    businessId: strOrNull(form, "businessId"),
    vatRegistered: form.get("vatRegistered") === "on",
    vatNumber: strOrNull(form, "vatNumber"),
    address: buildAddress(form),
    financialYearStartMonth: int(form, "financialYearStartMonth"),
    baseCurrency: str(form, "baseCurrency").toUpperCase(),
    metadata: {},
  });

  revalidatePath("/settings/entities");
  redirect(`/settings/entities/${created.id}`);
}

export async function updateEntityAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  await updateEntity(db, actor, {
    id: str(form, "id"),
    name: str(form, "name"),
    entityType: strOrNull(form, "entityType"),
    jurisdictionId: str(form, "jurisdictionId"),
    businessId: strOrNull(form, "businessId"),
    vatRegistered: form.get("vatRegistered") === "on",
    vatNumber: strOrNull(form, "vatNumber"),
    address: buildAddress(form),
    financialYearStartMonth: int(form, "financialYearStartMonth"),
    baseCurrency: str(form, "baseCurrency").toUpperCase(),
  });

  revalidatePath("/settings/entities");
  revalidatePath(`/settings/entities/${str(form, "id")}`);
}

export async function archiveEntityAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  await archiveEntity(db, actor, str(form, "id"));
  revalidatePath("/settings/entities");
  revalidatePath(`/settings/entities/${str(form, "id")}`);
}

export async function unarchiveEntityAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  await unarchiveEntity(db, actor, str(form, "id"));
  revalidatePath("/settings/entities");
  revalidatePath(`/settings/entities/${str(form, "id")}`);
}

export async function linkPersonAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  // `type="number"` is a browser-only hint; server actions can be
  // posted directly with anything in the string. Parse defensively
  // and normalise a failed parse to null so the domain layer sees a
  // clean optional value rather than NaN.
  const sharePercentRaw = form.get("sharePercent");
  let sharePercent: number | null = null;
  if (typeof sharePercentRaw === "string" && sharePercentRaw.trim() !== "") {
    const parsed = Number.parseFloat(sharePercentRaw);
    sharePercent = Number.isFinite(parsed) ? parsed : null;
  }

  await linkPersonToEntity(db, actor, {
    entityId: str(form, "entityId"),
    personId: str(form, "personId"),
    role: str(form, "role"),
    sharePercent,
    metadata: {},
  });
  revalidatePath(`/settings/entities/${str(form, "entityId")}`);
}

export async function unlinkPersonAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  await unlinkPersonFromEntity(db, actor, str(form, "linkId"));
  revalidatePath(`/settings/entities/${str(form, "entityId")}`);
}
