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
  const ids = collectIds(form);
  if (ids.length === 0) return;

  const results = await bulkMutate(ids, async (id) => {
    await sendJob(QUEUES.intakeOcr, { intakeItemId: id });
  });

  revalidatePath("/intake");
  for (const id of ids) revalidatePath(`/intake/${id}`);

  throwIfAnyFailed(results, "re-run OCR");
}

// ── Bulk mark personal ──────────────────────────────────────────────
// Routes every selected item to personal scope + expense flow. The
// user still has to open each (or run a second bulk-confirm) to
// finalise — we don't auto-confirm because the extracted fields
// usually need at least a glance.
export async function bulkMarkPersonalAction(form: FormData): Promise<void> {
  const ids = collectIds(form);
  if (ids.length === 0) return;
  const db = getDb();
  const actor = await getCurrentActor(db);

  const results = await bulkMutate(ids, async (id) => {
    await routeIntakeItem(db, actor, {
      id,
      isPersonal: true,
      entityId: null,
      targetFlow: "expense",
    });
  });

  revalidatePath("/intake");

  throwIfAnyFailed(results, "mark personal");
}

// ── Bulk route to a business entity + flow ──────────────────────────
// The inbox bar POSTs the selected ids, entityId and targetFlow.
// Useful when the user realises a batch of uploads all belong on
// the same entity (e.g. a month of one company's receipts).
export async function bulkRouteAction(form: FormData): Promise<void> {
  const ids = collectIds(form);
  if (ids.length === 0) return;
  const entityId = strOrNull(form, "entityId");
  const targetFlow = str(form, "targetFlow") as RouteIntakeInput["targetFlow"];
  if (!entityId) return;

  const db = getDb();
  const actor = await getCurrentActor(db);

  const results = await bulkMutate(ids, async (id) => {
    await routeIntakeItem(db, actor, {
      id,
      isPersonal: false,
      entityId,
      targetFlow,
    });
  });

  revalidatePath("/intake");

  throwIfAnyFailed(results, "route");
}

// ── Bulk reject ─────────────────────────────────────────────────────
export async function bulkRejectAction(form: FormData): Promise<void> {
  const ids = collectIds(form);
  if (ids.length === 0) return;
  const reason = strOrNull(form, "reason") ?? undefined;

  const db = getDb();
  const actor = await getCurrentActor(db);
  const results = await bulkMutate(ids, async (id) => {
    await rejectIntakeItem(db, actor, { id, reason });
  });
  revalidatePath("/intake");

  throwIfAnyFailed(results, "reject");
}

// ── Bulk attach to trip / claim ────────────────────────────────────
// Stub for v0.2. Trip / claim domains don't exist yet — mark the
// items as `trip`-routed so when the downstream confirm lands in
// v0.6 it can pick up the batch. Today this only sets the target
// flow + requires an entity; confirm is a no-op until trips ship.
export async function bulkAttachAction(form: FormData): Promise<void> {
  const ids = collectIds(form);
  if (ids.length === 0) return;
  const entityId = strOrNull(form, "entityId");
  const targetFlow = strOrNull(form, "targetFlow") as RouteIntakeInput["targetFlow"] | null;
  if (!entityId || !targetFlow) return;

  const db = getDb();
  const actor = await getCurrentActor(db);
  const results = await bulkMutate(ids, async (id) => {
    await routeIntakeItem(db, actor, {
      id,
      isPersonal: false,
      entityId,
      targetFlow,
    });
  });
  revalidatePath("/intake");

  throwIfAnyFailed(results, "attach");
}

// ── Bulk request missing evidence ──────────────────────────────────
// In v1.0 this emails uploaders asking them to supply the missing
// scan metadata. For v0.2 we just reject with a canned reason so
// the items leave the inbox; a future revision replaces the body
// with a real notification hook.
export async function bulkRequestEvidenceAction(form: FormData): Promise<void> {
  const ids = collectIds(form);
  if (ids.length === 0) return;

  const db = getDb();
  const actor = await getCurrentActor(db);
  const results = await bulkMutate(ids, async (id) => {
    await rejectIntakeItem(db, actor, {
      id,
      reason: "Missing evidence — uploader notified (placeholder)",
    });
  });
  revalidatePath("/intake");

  throwIfAnyFailed(results, "request evidence");
}

// Collect ids from either `ids` (array) or single `id` form field.
function collectIds(form: FormData): string[] {
  const multi = form.getAll("ids").map(String).filter(Boolean);
  if (multi.length > 0) return multi;
  const single = strOrNull(form, "id");
  return single ? [single] : [];
}

// Surface per-item failures from a bulk mutation so the page renders
// an error instead of returning a silent "success" when some rows
// failed. Revalidation has already run at the call site, so partial
// successes remain reflected in the inbox.
//
// TODO(ux): throwing from a server action shows Next.js's generic
// error page in production (messages are scrubbed) and triggers the
// nearest error boundary rather than an in-place toast. Migrate the
// bulk forms to `useActionState` so the failure detail (ids + reason)
// renders inline on the inbox without a navigation. Tracked as a
// follow-up — this helper stays as the minimum "not silent" guard.
function throwIfAnyFailed<T>(
  results: Array<{ id: string; result: { ok: true; value: T } | { ok: false; error: string } }>,
  verb: string,
): void {
  const failures = results.filter(
    (r): r is { id: string; result: { ok: false; error: string } } => !r.result.ok,
  );
  if (failures.length === 0) return;
  const detail = failures
    .slice(0, 3)
    .map((f) => `${f.id}: ${f.result.error}`)
    .join("; ");
  const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : "";
  throw new Error(
    `Failed to ${verb} ${failures.length} of ${results.length} item(s): ${detail}${more}`,
  );
}
