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

/**
 * Parse a `<input type="date">` value as UTC midnight. The project-wide
 * rule is no local-timezone leaks (docs/architecture/dates.md) — form
 * inputs arrive as `YYYY-MM-DD` and we pin them to `T00:00:00Z` so the
 * server never invents a local-time interpretation.
 *
 * Returns `undefined` for missing or blank values. Throws on values
 * that don't match the expected shape rather than emitting an
 * `Invalid Date` that would silently poison downstream code.
 */
export function parseDateInput(form: FormData, key: string): Date | undefined {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`Form field ${key} is not a YYYY-MM-DD date: ${v}`);
  }
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Form field ${key} is not a valid date: ${v}`);
  return d;
}
