"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { thingStateEnum } from "@/db/schema/enums";
import { getDb } from "@/db/client";
import { createReceipt, transitionReceipt, updateReceipt } from "@/domains/receipts";
import { getCurrentActor } from "@/lib/auth-shim";
import { parseDateInput, str, strOrNull } from "@/lib/form-helpers";
import type { ThingState } from "@/lib/versioning";

function parseState(raw: string): ThingState {
  if (!(thingStateEnum.enumValues as readonly string[]).includes(raw)) {
    throw new Error(`Unknown state: ${raw}`);
  }
  return raw as ThingState;
}

export async function createReceiptAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const occurredAt = parseDateInput(form, "occurredAt");
  if (!occurredAt) throw new Error("Missing form field: occurredAt");

  const created = await createReceipt(db, actor, {
    entityId: str(form, "entityId"),
    occurredAt,
    vendor: str(form, "vendor"),
    amount: str(form, "amount"),
    currency: str(form, "currency").toUpperCase(),
    notes: strOrNull(form, "notes"),
  });

  revalidatePath("/settings/receipts");
  redirect(`/settings/receipts/${created.id}`);
}

export async function updateReceiptAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const occurredAt = parseDateInput(form, "occurredAt");

  await updateReceipt(db, actor, {
    id,
    ...(occurredAt ? { occurredAt } : {}),
    vendor: str(form, "vendor"),
    amount: str(form, "amount"),
    currency: str(form, "currency").toUpperCase(),
    notes: strOrNull(form, "notes"),
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/receipts");
  revalidatePath(`/settings/receipts/${id}`);
}

export async function transitionReceiptAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await transitionReceipt(db, actor, {
    id,
    nextState: parseState(str(form, "nextState")),
    reason: strOrNull(form, "reason") ?? undefined,
    filedRef: strOrNull(form, "filedRef") ?? undefined,
  });

  revalidatePath("/settings/receipts");
  revalidatePath(`/settings/receipts/${id}`);
}
