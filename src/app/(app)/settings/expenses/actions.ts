"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import {
  createExpense,
  linkReceipt,
  markReimbursed,
  searchReceiptsForExpense,
  transitionExpense,
  updateExpense,
  type ReceiptCandidate,
} from "@/domains/expenses";
import { getCurrentActor } from "@/lib/auth-shim";
import { parseDateInput, str, strOrNull } from "@/lib/form-helpers";
import { assertCan } from "@/lib/iam/permissions";
import type { ThingState } from "@/lib/versioning";
import { thingStateEnum } from "@/db/schema/enums";

function parseState(raw: string): ThingState {
  if (!(thingStateEnum.enumValues as readonly string[]).includes(raw)) {
    throw new Error(`Unknown state: ${raw}`);
  }
  return raw as ThingState;
}

function parsePaidBy(
  raw: string | null,
): "entity" | "personal_reimbursable" | "personal_no_reimburse" | undefined {
  if (raw === null) return undefined;
  if (raw === "entity" || raw === "personal_reimbursable" || raw === "personal_no_reimburse") {
    return raw;
  }
  throw new Error(`Unknown paid_by: ${raw}`);
}

export async function createExpenseAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const occurredAt = parseDateInput(form, "occurredAt");
  if (!occurredAt) throw new Error("Missing form field: occurredAt");

  const created = await createExpense(db, actor, {
    entityId: str(form, "entityId"),
    categoryId: strOrNull(form, "categoryId"),
    vendor: strOrNull(form, "vendor"),
    occurredAt,
    amount: str(form, "amount"),
    currency: str(form, "currency").toUpperCase(),
    vatAmount: strOrNull(form, "vatAmount"),
    vatRate: strOrNull(form, "vatRate"),
    // Unchecked checkbox is omitted from FormData entirely (form.get → null).
    // Only "true" means deductible; anything else (null, "", missing) is false.
    vatDeductible: form.get("vatDeductible") === "true",
    paidBy: parsePaidBy(strOrNull(form, "paidBy")),
    linkedReceiptId: strOrNull(form, "linkedReceiptId"),
    description: strOrNull(form, "description"),
  });

  revalidatePath("/settings/expenses");
  redirect(`/settings/expenses/${created.id}`);
}

export async function updateExpenseAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  const occurredAt = parseDateInput(form, "occurredAt");

  await updateExpense(db, actor, {
    id,
    categoryId: strOrNull(form, "categoryId"),
    vendor: strOrNull(form, "vendor"),
    ...(occurredAt ? { occurredAt } : {}),
    amount: str(form, "amount"),
    currency: str(form, "currency").toUpperCase(),
    vatAmount: strOrNull(form, "vatAmount"),
    vatRate: strOrNull(form, "vatRate"),
    vatDeductible: form.get("vatDeductible") === "true",
    paidBy: parsePaidBy(strOrNull(form, "paidBy")),
    description: strOrNull(form, "description"),
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/expenses");
  revalidatePath(`/settings/expenses/${id}`);
}

export async function transitionExpenseAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await transitionExpense(db, actor, {
    id,
    nextState: parseState(str(form, "nextState")),
    reason: strOrNull(form, "reason") ?? undefined,
    filedRef: strOrNull(form, "filedRef") ?? undefined,
  });

  revalidatePath("/settings/expenses");
  revalidatePath(`/settings/expenses/${id}`);
}

export async function markReimbursedAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const id = str(form, "id");
  await markReimbursed(db, actor, {
    id,
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath("/settings/expenses");
  revalidatePath(`/settings/expenses/${id}`);
}

export async function linkReceiptAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const expenseId = str(form, "expenseId");
  const receiptId = strOrNull(form, "receiptId");

  await linkReceipt(db, actor, {
    expenseId,
    receiptId,
    reason: strOrNull(form, "reason") ?? undefined,
  });

  revalidatePath(`/settings/expenses/${expenseId}`);
}

/**
 * Server-action variant of the receipt search used by the linker
 * combobox. Returns a serialisable shape (Date → ISO string) so the
 * client can render without bringing in Date deserialisation hacks.
 */
export interface ReceiptSearchResult {
  id: string;
  vendor: string;
  occurredAt: string;
  amount: string;
  currency: string;
}

export async function searchReceiptsAction(input: {
  entityId: string;
  query: string;
}): Promise<ReceiptSearchResult[]> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  // Server actions are callable from any authenticated session — the
  // entityId is caller-supplied. Without this assertion, a user with
  // receipts:read on entity A could pass entity B's id and read its
  // receipts. Mirrors the pattern in every mutation in this file.
  await assertCan(db, actor.user, "receipts", "read", { entityId: input.entityId });
  const rows: ReceiptCandidate[] = await searchReceiptsForExpense(db, {
    entityId: input.entityId,
    query: input.query,
    limit: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    occurredAt: r.occurredAt.toISOString(),
    amount: r.amount,
    currency: r.currency,
  }));
}

/**
 * Mass actions: bulk transition + bulk mark reimbursed. Each action
 * iterates the selection sequentially so a single failure surfaces
 * with the offending id rather than silently rolling back a whole
 * batch (or worse, partially succeeding without telling the caller).
 *
 * Both server actions revalidate the list page once at the end —
 * one cache eviction instead of N.
 */
export async function bulkTransitionAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const ids = form.getAll("ids").filter((v): v is string => typeof v === "string");
  const nextState = parseState(str(form, "nextState"));

  for (const id of ids) {
    await transitionExpense(db, actor, { id, nextState });
  }

  revalidatePath("/settings/expenses");
}

export async function bulkMarkReimbursedAction(form: FormData): Promise<void> {
  const db = getDb();
  const actor = await getCurrentActor(db);

  const ids = form.getAll("ids").filter((v): v is string => typeof v === "string");

  for (const id of ids) {
    await markReimbursed(db, actor, { id });
  }

  revalidatePath("/settings/expenses");
}
