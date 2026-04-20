import {
  applyPatch as applyPatchRaw,
  createPatch as createPatchRaw,
  type Operation,
} from "rfc6902";

import type { JsonPatch, Snapshot } from "./types";

/**
 * Thin wrapper around `rfc6902` to keep the storage format explicit
 * and prevent library types from leaking into domain code. Snapshots
 * are deep-cloned before the library mutates them so callers can reuse
 * the inputs after diffing.
 */

function clone<T>(value: T): T {
  // `rfc6902` mutates its second argument under `applyPatch`. Structured
  // clone is the cheapest way to get a safe copy of anything json-shaped.
  return structuredClone(value);
}

export function createPatch(from: Snapshot, to: Snapshot): JsonPatch {
  // `rfc6902.createPatch`'s `Operation` union is structurally assignable
  // to our `JsonPatchOp[]` (same fields, same `op` discriminator), but
  // TS can't unify the two unions directly — one cast at the boundary
  // keeps the rest of the app on our typed union.
  return createPatchRaw(clone(from), clone(to)) as JsonPatch;
}

export function applyPatch(base: Snapshot, patch: JsonPatch): Snapshot {
  const next = clone(base);
  // Boundary cast in the other direction, for the same reason.
  const results = applyPatchRaw(next, patch as Operation[]);
  const failure = results.find((r) => r !== null);
  if (failure) {
    throw new Error(`applyPatch failed: ${failure.message}`);
  }
  return next;
}
