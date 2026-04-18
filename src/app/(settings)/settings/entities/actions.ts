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

function int(form: FormData, key: string): number {
  const v = form.get(key);
  if (typeof v !== "string") throw new Error(`missing ${key}`);
  return Number.parseInt(v, 10);
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  if (typeof v !== "string") throw new Error(`missing ${key}`);
  return v;
}

function strOrNull(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  return v;
}

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
  const sharePercentRaw = form.get("sharePercent");
  await linkPersonToEntity(db, actor, {
    entityId: str(form, "entityId"),
    personId: str(form, "personId"),
    role: str(form, "role"),
    sharePercent:
      typeof sharePercentRaw === "string" && sharePercentRaw.trim() !== ""
        ? Number.parseFloat(sharePercentRaw)
        : null,
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
