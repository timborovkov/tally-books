import type { Snapshot } from "./types";

/**
 * Assert that a Drizzle `.returning()` call produced a row. Idiomatic
 * Drizzle writes return `T[]`; destructuring gives `T | undefined`.
 * Every versioned mutation has the same "row missing after write means
 * the schema or the WHERE clause drifted" invariant — one helper means
 * the error message stays consistent and the call sites shrink.
 */
export function assertReturning<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new Error(`${what} returned no row — the write did not land as expected`);
  }
  return row;
}

/**
 * Extract the domain-field subset of a parent row — the shape we snapshot
 * into a version row and diff against. Done as a plain utility because
 * Drizzle row types are wide (every column), but the logical Thing is
 * only a handful of fields. Keeping the field list next to the domain
 * mutation keeps the domain boundary explicit.
 *
 * Normalises Postgres numeric (comes back as a string) and Date to stable
 * json-safe shapes so round-tripping through `createPatch` / `applyPatch`
 * doesn't see spurious diffs across equivalent representations.
 */
export function pickSnapshot<T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T)[],
): Snapshot {
  const out: Snapshot = {};
  for (const field of fields) {
    const v = row[field];
    if (v instanceof Date) {
      out[field as string] = v.toISOString();
    } else if (v === undefined) {
      out[field as string] = null;
    } else {
      out[field as string] = v as unknown;
    }
  }
  return out;
}
