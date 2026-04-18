"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { createPerson, deletePerson, updatePerson } from "@/domains/persons";
import { getCurrentActor } from "@/lib/auth-shim";
import { str, strOrNull } from "@/lib/form-helpers";

function parseIds(form: FormData): Record<string, string> {
  // ids_keys[] / ids_values[] are aligned arrays sent by the IDs editor.
  const keys = form.getAll("ids_key").filter((v): v is string => typeof v === "string");
  const values = form.getAll("ids_value").filter((v): v is string => typeof v === "string");
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]?.trim();
    const v = values[i]?.trim();
    if (k && v) out[k] = v;
  }
  return out;
}

// Build the contact object from every `contact_*` field the form
// renders. The domain `updatePerson` does a wholesale replacement of
// the `contact` jsonb column, so any sub-field missing here would be
// silently dropped on save — keep this in sync with PersonForm's
// rendered inputs (email, phone, notes today).
function buildContact(form: FormData): {
  email?: string;
  phone?: string;
  notes?: string;
} {
  return {
    email: strOrNull(form, "contact_email") ?? undefined,
    phone: strOrNull(form, "contact_phone") ?? undefined,
    notes: strOrNull(form, "contact_notes") ?? undefined,
  };
}

export async function createPersonAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  const created = await createPerson(db, actor, {
    legalName: str(form, "legalName"),
    taxResidency: strOrNull(form, "taxResidency"),
    ids: parseIds(form),
    addresses: [],
    contact: buildContact(form),
    metadata: {},
  });

  revalidatePath("/settings/persons");
  redirect(`/settings/persons/${created.id}`);
}

export async function updatePersonAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  await updatePerson(db, actor, {
    id: str(form, "id"),
    legalName: str(form, "legalName"),
    taxResidency: strOrNull(form, "taxResidency"),
    ids: parseIds(form),
    contact: buildContact(form),
  });

  revalidatePath("/settings/persons");
  revalidatePath(`/settings/persons/${str(form, "id")}`);
}

export async function deletePersonAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  await deletePerson(db, actor, str(form, "id"));
  revalidatePath("/settings/persons");
  redirect("/settings/persons");
}
