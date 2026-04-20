import type { JsonPatch, JsonPatchOp } from "@/lib/versioning";

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pathSegments(path: string): string[] {
  // RFC 6902 paths are "/a/b/c". Split, decode ~1 → /, ~0 → ~ per §4.
  return path
    .replace(/^\//, "")
    .split("/")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function pathLabel(path: string): string {
  return pathSegments(path).join(" › ");
}

function resolveBefore(snapshot: Record<string, unknown> | null, path: string): unknown {
  if (!snapshot) return undefined;
  let cur: unknown = snapshot;
  for (const seg of pathSegments(path)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Renders an RFC 6902 patch as a list of human-readable rows. No diff
 * library needed — our field shapes are flat enough that per-op formatting
 * is the clearest surface. The companion snapshot is passed in so we can
 * show the "before" value for `replace` / `remove` ops (JSON Patch itself
 * only carries the "after" value).
 */
export function DiffView({
  patch,
  previousSnapshot,
}: {
  patch: JsonPatch;
  previousSnapshot: Record<string, unknown> | null;
}) {
  if (patch.length === 0) {
    return (
      <p className="text-muted-foreground text-xs italic">
        No field changes (state transition or initial version).
      </p>
    );
  }

  return (
    <dl className="divide-border grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 text-xs">
      {patch.map((op, i) => (
        <div key={`${op.path}-${i}`} className="contents">
          <dt className="text-muted-foreground truncate py-1 font-medium">{pathLabel(op.path)}</dt>
          <dd className="py-1">{renderOp(op, previousSnapshot)}</dd>
        </div>
      ))}
    </dl>
  );
}

function renderOp(op: JsonPatchOp, previousSnapshot: Record<string, unknown> | null) {
  // Exhaustive switch — `move` and `copy` render as path→path swaps,
  // everything else reads `value` / prior snapshot.
  switch (op.op) {
    case "add":
      return <span>+ {formatValue(op.value)}</span>;
    case "remove":
      return (
        <span className="text-muted-foreground line-through">
          {formatValue(resolveBefore(previousSnapshot, op.path))}
        </span>
      );
    case "replace":
    case "test":
      return (
        <span>
          <span className="text-muted-foreground line-through">
            {formatValue(resolveBefore(previousSnapshot, op.path))}
          </span>{" "}
          → <span className="font-medium">{formatValue(op.value)}</span>
        </span>
      );
    case "move":
    case "copy":
      return (
        <span>
          {op.op} from <code>{op.from}</code>
        </span>
      );
  }
}
