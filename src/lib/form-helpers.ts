/**
 * Tiny helpers for pulling typed values out of a `FormData`. Server
 * actions use these to narrow the raw `string | File | null` that
 * `FormData.get()` returns into the shapes domain services expect.
 *
 * Throws on missing required fields — server actions catch those and
 * surface them to the user; the helpers deliberately don't do their
 * own error shaping so each call site can decide how strict to be.
 */

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  if (typeof v !== "string") throw new Error(`Missing form field: ${key}`);
  return v;
}

/**
 * Returns null for missing keys AND empty/whitespace-only strings.
 * Server actions lean on this for optional text fields (VAT number,
 * business ID, addresses) where the user leaves the input blank.
 */
export function strOrNull(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  return v;
}

export function int(form: FormData, key: string): number {
  const v = str(form, key);
  const parsed = Number.parseInt(v, 10);
  if (Number.isNaN(parsed)) throw new Error(`Form field ${key} is not an integer: ${v}`);
  return parsed;
}
