import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StateBadge } from "@/components/versioning/StateBadge";
import {
  VersionTimeline,
  type TimelineVersion,
} from "@/components/versioning/VersionTimeline";
import type { AuditLogEntry } from "@/db/schema";

function makeVersion(
  versionNum: number,
  opts: Partial<TimelineVersion["version"]> = {},
): TimelineVersion {
  return {
    version: {
      id: `ver_${versionNum}`,
      versionNum,
      stateSnapshot: { vendor: versionNum === 1 ? "Lidl" : "Prisma", amount: "9.9900" },
      diff: versionNum === 1 ? [] : [{ op: "replace", path: "/vendor", value: "Prisma" }],
      semanticSummary: opts.semanticSummary ?? null,
      actorKind: opts.actorKind ?? "user",
      createdAt: new Date("2026-04-20T12:00:00Z"),
      ...opts,
    },
    actor: { id: "u_1", name: "Anna", email: "anna@example.com" },
  };
}

describe("VersionTimeline", () => {
  it("renders an empty-state message when there are no versions", () => {
    render(<VersionTimeline versions={[]} auditEntries={[]} />);
    expect(screen.getByText(/no versions yet/i)).toBeInTheDocument();
  });

  it("renders versions in reverse chronological order with actor + state change diff", () => {
    const versions = [makeVersion(1), makeVersion(2, { semanticSummary: "fixed vendor name" })];
    render(<VersionTimeline versions={versions} auditEntries={[]} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Version 2");
    expect(items[1]).toHaveTextContent("Version 1");
    expect(screen.getByText(/fixed vendor name/i)).toBeInTheDocument();
    // Field change surfaced via DiffView.
    expect(screen.getAllByText(/Prisma/i).length).toBeGreaterThan(0);
  });

  it("shows the audit action badge next to the matching version", () => {
    const versions = [makeVersion(1), makeVersion(2)];
    const audit: AuditLogEntry[] = [
      {
        id: "a_1",
        actorId: "u_1",
        actorKind: "user",
        agentId: null,
        action: "receipt.updated",
        thingType: "receipt",
        thingId: "rcp_1",
        payload: { toVersion: 2, fromVersion: 1, diffLen: 1 },
        at: new Date("2026-04-20T12:05:00Z"),
      },
    ];
    render(<VersionTimeline versions={versions} auditEntries={audit} />);
    expect(screen.getByText("receipt.updated")).toBeInTheDocument();
  });

  it("labels system-actor versions with 'System' and a badge", () => {
    const systemVersion = makeVersion(2, { actorKind: "system" });
    systemVersion.actor = null;
    render(<VersionTimeline versions={[makeVersion(1), systemVersion]} auditEntries={[]} />);
    expect(screen.getByText(/^System$/)).toBeInTheDocument();
    expect(screen.getByText(/^system$/)).toBeInTheDocument();
  });
});

describe("StateBadge", () => {
  it("renders the label for each state", () => {
    const { rerender } = render(<StateBadge state="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    rerender(<StateBadge state="filed" />);
    expect(screen.getByText("Filed")).toBeInTheDocument();
    rerender(<StateBadge state="amending" />);
    expect(screen.getByText("Amending")).toBeInTheDocument();
  });
});
