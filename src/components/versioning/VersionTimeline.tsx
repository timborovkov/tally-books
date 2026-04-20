import { Badge } from "@/components/ui/badge";
import type { AuditLogEntry } from "@/db/schema";
import type { ActorKind } from "@/lib/domain-types";
import type { JsonPatch } from "@/lib/versioning";

import { DiffView } from "./DiffView";

/**
 * Structural shape the timeline needs from any `<thing>_versions` row.
 * Deliberately not `Pick<ReceiptVersion, ...>` so invoice / expense /
 * vat_declaration pages can pass their own version rows without
 * conforming to receipts' table type.
 */
export interface TimelineVersion {
  version: {
    id: string;
    versionNum: number;
    stateSnapshot: unknown;
    diff: unknown;
    semanticSummary: string | null;
    actorKind: ActorKind;
    createdAt: Date;
  };
  actor: { id: string; name: string | null; email: string } | null;
}

/**
 * Google-Docs-style vertical history for any versioned Thing.
 *
 * Server Component — takes pre-loaded versions + audit entries from the
 * caller (typically a page's server loader) and renders them in reverse
 * chronological order. No client state, no fetches. If the caller wants
 * click-to-expand interactivity it wraps individual entries in a Client
 * Component; the primary read is scannable as static markup.
 *
 * Kept thing-agnostic in its prop shape — the receipts-specific loader
 * lives in `src/domains/receipts/queries.ts` and hands pre-joined rows
 * to this component. Invoice / expense pages can do the same without
 * changing the component.
 */
export function VersionTimeline({
  versions,
  auditEntries,
  emptyMessage = "No versions yet.",
}: {
  versions: TimelineVersion[];
  auditEntries: AuditLogEntry[];
  emptyMessage?: string;
}) {
  if (versions.length === 0) {
    return <p className="text-muted-foreground text-sm italic">{emptyMessage}</p>;
  }

  // Audits are looked up by payload.versionNum / toVersion. Versions
  // that don't have a matching audit render without the action badge.
  const auditByVersion = new Map<number, AuditLogEntry>();
  for (const entry of auditEntries) {
    const payload = entry.payload as Record<string, unknown>;
    const ver = (payload?.versionNum ?? payload?.toVersion) as number | undefined;
    if (typeof ver === "number") auditByVersion.set(ver, entry);
  }

  // Snapshot lookup: build previousSnapshot for each version by pairing
  // it with the previous index in asc order. Render in reverse.
  const ordered = [...versions].sort((a, b) => a.version.versionNum - b.version.versionNum);
  const previousByVersion = new Map<number, Record<string, unknown> | null>();
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]!;
    const prev = ordered[i - 1];
    previousByVersion.set(
      current.version.versionNum,
      (prev?.version.stateSnapshot as Record<string, unknown>) ?? null,
    );
  }

  const reversed = [...ordered].reverse();

  return (
    <ol className="border-border flex flex-col gap-0 border-l">
      {reversed.map((v) => {
        const audit = auditByVersion.get(v.version.versionNum);
        const actorLabel =
          v.version.actorKind === "system"
            ? "System"
            : (v.actor?.name ?? v.actor?.email ?? "Unknown user");
        return (
          <li
            key={v.version.id}
            className="before:bg-primary relative pb-6 pl-6 before:absolute before:top-1.5 before:-left-[5px] before:h-2.5 before:w-2.5 before:rounded-full"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">Version {v.version.versionNum}</span>
              <span className="text-muted-foreground text-xs">
                {v.version.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs">{actorLabel}</span>
              {v.version.actorKind === "system" ? (
                <Badge variant="secondary" className="text-[10px]">
                  system
                </Badge>
              ) : null}
              {audit ? (
                <Badge variant="outline" className="text-[10px]">
                  {audit.action}
                </Badge>
              ) : null}
            </div>
            {v.version.semanticSummary ? (
              <p className="text-muted-foreground mt-1 text-xs italic">
                {v.version.semanticSummary}
              </p>
            ) : null}
            <div className="mt-2">
              <DiffView
                patch={v.version.diff as JsonPatch}
                previousSnapshot={previousByVersion.get(v.version.versionNum) ?? null}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
