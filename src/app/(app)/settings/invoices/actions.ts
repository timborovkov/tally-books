"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { invoices } from "@/db/schema";
import { thingStateEnum } from "@/db/schema/enums";
import {
  createInternalInvoice,
  createInvoice,
  markInvoicePaid,
  markInvoiceUnpaid,
  parseLineItems,
  transitionInvoice,
  updateInvoice,
  type InvoiceDeliveryMethod,
  type InvoiceLineItem,
} from "@/domains/invoices";
import { NotFoundError } from "@/domains/errors";
import { getCurrentActor } from "@/lib/auth-shim";
import { parseDateInput, str, strOrNull } from "@/lib/form-helpers";
import { assertCan } from "@/lib/iam/permissions";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { ThingState } from "@/lib/versioning";

const VALID_DELIVERY_METHODS: InvoiceDeliveryMethod[] = ["e_invoice", "pdf", "email", "manual"];

function parseState(raw: string): ThingState {
  if (!(thingStateEnum.enumValues as readonly string[]).includes(raw)) {
    throw new Error(`Unknown state: ${raw}`);
  }
  return raw as ThingState;
}

function parseDeliveryMethod(raw: string | null): InvoiceDeliveryMethod | undefined {
  if (raw === null) return undefined;
  if ((VALID_DELIVERY_METHODS as readonly string[]).includes(raw)) {
    return raw as InvoiceDeliveryMethod;
  }
  throw new Error(`Unknown delivery method: ${raw}`);
}

function parseLineItemsField(form: FormData): InvoiceLineItem[] {
  const raw = form.get("lineItems");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("lineItems is not valid JSON");
  }
  return parseLineItems(parsed);
}

function clientIdField(form: FormData): string | null {
  const v = form.get("clientId");
  if (typeof v !== "string" || v === "" || v === "__none") return null;
  return v;
}

export async function createInvoiceAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const created = await createInvoice(db, actor, {
    entityId: str(form, "entityId"),
    clientId: clientIdField(form),
    issueDate: parseDateInput(form, "issueDate"),
    dueDate: parseDateInput(form, "dueDate"),
    lineItems: parseLineItemsField(form),
    currency: str(form, "currency").toUpperCase(),
    deliveryMethod: parseDeliveryMethod(strOrNull(form, "deliveryMethod")),
    description: strOrNull(form, "description"),
  });

  revalidatePath("/settings/invoices");
  redirect(`/settings/invoices/${created.id}`);
}

export async function updateInvoiceAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");

  await updateInvoice(db, actor, {
    id,
    clientId: clientIdField(form),
    issueDate: parseDateInput(form, "issueDate") ?? null,
    dueDate: parseDateInput(form, "dueDate") ?? null,
    lineItems: parseLineItemsField(form),
    currency: str(form, "currency").toUpperCase(),
    deliveryMethod: parseDeliveryMethod(strOrNull(form, "deliveryMethod")),
    description: strOrNull(form, "description"),
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/invoices");
  revalidatePath(`/settings/invoices/${id}`);
}

export async function transitionInvoiceAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await transitionInvoice(db, actor, {
    id,
    nextState: parseState(str(form, "nextState")),
    reason: strOrNull(form, "reason") ?? undefined,
    filedRef: strOrNull(form, "filedRef") ?? undefined,
  });

  revalidatePath("/settings/invoices");
  revalidatePath(`/settings/invoices/${id}`);
}

export async function markInvoicePaidAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await markInvoicePaid(db, actor, {
    id,
    paidAt: parseDateInput(form, "paidAt"),
    paymentRef: strOrNull(form, "paymentRef"),
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/invoices");
  revalidatePath(`/settings/invoices/${id}`);
}

export async function markInvoiceUnpaidAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await markInvoiceUnpaid(db, actor, {
    id,
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/invoices");
  revalidatePath(`/settings/invoices/${id}`);
}

export async function bulkTransitionInvoicesAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const ids = form.getAll("ids").filter((v): v is string => typeof v === "string");
  const nextState = parseState(str(form, "nextState"));

  for (const id of ids) {
    await transitionInvoice(db, actor, { id, nextState });
  }

  revalidatePath("/settings/invoices");
}

export async function bulkMarkInvoicesPaidAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const ids = form.getAll("ids").filter((v): v is string => typeof v === "string");

  for (const id of ids) {
    await markInvoicePaid(db, actor, { id });
  }

  revalidatePath("/settings/invoices");
}

export async function createInternalInvoiceAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const lineItems = parseLineItemsField(form);
  const { seller } = await createInternalInvoice(db, actor, {
    sellerEntityId: str(form, "sellerEntityId"),
    buyerEntityId: str(form, "buyerEntityId"),
    issueDate: parseDateInput(form, "issueDate"),
    dueDate: parseDateInput(form, "dueDate"),
    currency: str(form, "currency").toUpperCase(),
    lineItems,
    description: strOrNull(form, "description"),
  });

  revalidatePath("/settings/invoices");
  redirect(`/settings/invoices/${seller.id}`);
}

/**
 * PDF download. Returns base64-encoded bytes which the client converts
 * into a Blob URL — server actions can't return raw `Response` objects
 * to client components.
 *
 * Auth: gated behind `invoices:read` scoped to the invoice's entity.
 * Without this gate, `renderInvoicePdf` would happily serialise any
 * invoice for any authenticated user — full line items, totals, and
 * banking details — bypassing per-entity IAM scope.
 */
export async function downloadInvoicePdfAction(invoiceId: string): Promise<{
  fileName: string;
  base64: string;
}> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  // Look up entityId before rendering so the scope check is precise.
  // Cheap (PK lookup, no joins) — the renderer re-reads the row in full.
  const [row] = await db
    .select({ entityId: invoices.entityId, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new NotFoundError("invoice", invoiceId);
  await assertCan(db, actor.user, "invoices", "read", { entityId: row.entityId });

  const buffer = await renderInvoicePdf(db, invoiceId);
  return {
    fileName: `invoice-${row.number ?? invoiceId}.pdf`,
    base64: buffer.toString("base64"),
  };
}
