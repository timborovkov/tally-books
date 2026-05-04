"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import {
  archiveParty,
  createParty,
  unarchiveParty,
  updateParty,
  type PartyKind,
} from "@/domains/parties";
import { getCurrentActor } from "@/lib/auth-shim";
import { str, strOrNull } from "@/lib/form-helpers";

const VALID_KINDS = ["client", "supplier", "contractor", "employee"] as const;

function parseKind(raw: string): PartyKind {
  if (!(VALID_KINDS as readonly string[]).includes(raw)) {
    throw new Error(`Unknown party kind: ${raw}`);
  }
  return raw as PartyKind;
}

interface KeyValuePair {
  key: string;
  value: string;
}

/**
 * Pull `name`+`_key` / `name`+`_value` pairs out of a FormData and turn
 * them into a flat record. Empty keys (or empty values when the key is
 * also empty) are dropped — the user is allowed to leave the trailing
 * blank row alone. Same convention used by PersonForm / EntityForm.
 */
function pickKeyValuePairs(form: FormData, base: string): Record<string, string> {
  const keys = form.getAll(`${base}_key`).filter((v): v is string => typeof v === "string");
  const values = form.getAll(`${base}_value`).filter((v): v is string => typeof v === "string");
  const pairs: KeyValuePair[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!.trim();
    const v = (values[i] ?? "").trim();
    if (k === "") continue;
    pairs.push({ key: k, value: v });
  }
  const out: Record<string, string> = {};
  for (const { key, value } of pairs) {
    out[key] = value;
  }
  return out;
}

function pickContact(form: FormData): Record<string, unknown> {
  const email = strOrNull(form, "contact_email");
  const phone = strOrNull(form, "contact_phone");
  const website = strOrNull(form, "contact_website");
  const notes = strOrNull(form, "contact_notes");
  const address = {
    line1: strOrNull(form, "address_line1") ?? undefined,
    line2: strOrNull(form, "address_line2") ?? undefined,
    city: strOrNull(form, "address_city") ?? undefined,
    region: strOrNull(form, "address_region") ?? undefined,
    postcode: strOrNull(form, "address_postcode") ?? undefined,
    country: strOrNull(form, "address_country")?.toUpperCase() ?? undefined,
  };
  const hasAddress = Object.values(address).some((v) => v !== undefined);
  const out: Record<string, unknown> = {};
  if (email) out.email = email;
  if (phone) out.phone = phone;
  if (website) out.website = website;
  if (notes) out.notes = notes;
  if (hasAddress) out.address = address;
  return out;
}

export async function createPartyAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const created = await createParty(db, actor, {
    kind: parseKind(str(form, "kind")),
    name: str(form, "name"),
    legalEntityId: strOrNull(form, "legalEntityId"),
    contact: pickContact(form),
    taxIds: pickKeyValuePairs(form, "taxIds"),
  });

  revalidatePath("/settings/parties");
  redirect(`/settings/parties/${created.id}`);
}

export async function updatePartyAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await updateParty(db, actor, {
    id,
    kind: parseKind(str(form, "kind")),
    name: str(form, "name"),
    legalEntityId: strOrNull(form, "legalEntityId"),
    contact: pickContact(form),
    taxIds: pickKeyValuePairs(form, "taxIds"),
  });

  revalidatePath("/settings/parties");
  revalidatePath(`/settings/parties/${id}`);
}

export async function archivePartyAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await archiveParty(db, actor, { id, reason: strOrNull(form, "reason") ?? undefined });

  revalidatePath("/settings/parties");
  revalidatePath(`/settings/parties/${id}`);
}

export async function unarchivePartyAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await unarchiveParty(db, actor, id);

  revalidatePath("/settings/parties");
  revalidatePath(`/settings/parties/${id}`);
}
