import type { thingStateEnum } from "@/db/schema/enums";

export type ThingState = (typeof thingStateEnum.enumValues)[number];

/**
 * RFC 6902 JSON Patch operations, discriminated on `op`. Keeping the
 * union local means consumers (`DiffView`, mutation code) get exhaustive
 * switch checks without pulling `rfc6902`'s types into app code.
 * The only place that crosses the boundary with `rfc6902`'s own types
 * is `diff.ts`.
 */
export type JsonPatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };

export type JsonPatch = JsonPatchOp[];

export type Snapshot = Record<string, unknown>;
