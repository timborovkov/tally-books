"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import {
  bulkMutate,
  confirmIntakeItem,
  rejectIntakeItem,
  reRouteIntakeItem,
  routeIntakeItem,
  type RouteIntakeInput,
} from "@/domains/intake";
import { getCurrentActor } from "@/lib/auth-shim";
import { parseDateInput, str, strOrNull } from "@/lib/form-helpers";
import { sendJob, QUEUES } from "@/lib/jobs";

// ── Routing form handler ────────────────────────────────────────────
// Sets the isPersonal / entityId / targetFlow triplet. Used by the
// review page when the user picks where a scan is going.
export async function routeIntakeAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const isPersonalRaw = strOrNull(form, "isPersonal");
  const entityIdRaw = strOrNull(form, "entityId");
  const targetFlowRaw = str(form, "targetFlow");

  const input: RouteIntakeInput = {
    id,
    isPersonal: isPersonalRaw === null ? null : isPersonalRaw === "true",
    entityId: entityIdRaw,
    targetFlow: targetFlowRaw as RouteIntakeInput["targetFlow"],
  };

  await routeIntakeItem(db, actor, input);
  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
}

// ── Confirm form handler ────────────────────────────────────────────
// The review form POSTs both the routing (if not yet set) AND the
// final field values the user edited on top of OCR. If the item
// isn't yet in 'routed' state, route it first, then confirm.
export async function confirmIntakeAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");

  // Route-then-confirm when the form carries routing fields. Skips
  // the route write when fields are absent (second-step confirm
  // after a separate route action).
  const targetFlow = strOrNull(form, "targetFlow");
  if (targetFlow) {
    const isPersonal = strOrNull(form, "isPersonal");
    const entityId = strOrNull(form, "entityId");
    await routeIntakeItem(db, actor, {
      id,
      isPersonal: isPersonal === null ? null : isPersonal === "true",
      entityId,
      targetFlow: targetFlow as RouteIntakeInput["targetFlow"],
    });
  }

  const occurredAt = parseDateInput(form, "occurredAt");
  const vendor = strOrNull(form, "vendor");
  const amount = strOrNull(form, "amount");
  const currency = strOrNull(form, "currency");
  const notes = strOrNull(form, "notes");

  await confirmIntakeItem(db, actor, {
    id,
    receipt: {
      ...(occurredAt ? { occurredAt } : {}),
      ...(vendor ? { vendor } : {}),
      ...(amount ? { amount } : {}),
      ...(currency ? { currency: currency.toUpperCase() } : {}),
      notes: notes ?? null,
    },
  });

  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
  redirect("/intake");
}

// ── Reject ──────────────────────────────────────────────────────────
export async function rejectIntakeAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const reason = strOrNull(form, "reason") ?? undefined;
  await rejectIntakeItem(db, actor, { id, reason });
  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
}

// ── Re-route (wrong-route recovery) ─────────────────────────────────
export async function reRouteIntakeAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const isPersonal = strOrNull(form, "isPersonal");
  const entityId = strOrNull(form, "entityId");
  const targetFlow = str(form, "targetFlow");

  await reRouteIntakeItem(db, actor, {
    id,
    isPersonal: isPersonal === null ? null : isPersonal === "true",
    entityId,
    targetFlow: targetFlow as RouteIntakeInput["targetFlow"],
  });

  revalidatePath("/intake");
  revalidatePath(`/intake/${id}`);
}

// ── Re-extract ──────────────────────────────────────────────────────
// Re-enqueue the OCR job for one or many items. Useful when the
// initial extraction was poor or a new model is available.
export async function reExtractIntakeAction(form: FormData): Promise<void> {
  const ids = form.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) {
    const id = strOrNull(form, "id");
    if (id) ids.push(id);
  }
  if (ids.length === 0) return;

  await bulkMutate(ids, async (id) => {
    await sendJob(QUEUES.intakeOcr, { intakeItemId: id });
  });

  revalidatePath("/intake");
  for (const id of ids) revalidatePath(`/intake/${id}`);
}
