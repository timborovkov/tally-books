import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

describe("AppShell", () => {
  it("renders top nav, sidebar, and children", () => {
    render(
      <AppShell>
        <div data-testid="content">dashboard content</div>
      </AppShell>,
    );

    // Top nav: global search is a labelled textbox.
    expect(screen.getByRole("searchbox", { name: /global search/i })).toBeInTheDocument();

    // Sidebar: primary navigation landmark exists with its links.
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entities/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /expenses/i })).toBeInTheDocument();

    // Children pass through.
    expect(screen.getByTestId("content")).toHaveTextContent("dashboard content");
  });

  it("exposes the quick-add button keyboard-reachably", () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const btn = screen.getByRole("button", { name: /quick add/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tabIndex).not.toBe(-1);
  });
});
