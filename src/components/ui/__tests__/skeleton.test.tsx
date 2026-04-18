import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("renders a status region with pulsing background", () => {
    render(<Skeleton data-testid="sk" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.className).toMatch(/bg-muted/);
  });

  it("merges custom className via cn() without losing defaults", () => {
    render(<Skeleton data-testid="sk" className="h-10 w-20" />);
    const el = screen.getByTestId("sk");
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.className).toMatch(/h-10/);
    expect(el.className).toMatch(/w-20/);
  });

  it("forwards arbitrary DOM props", () => {
    render(<Skeleton data-testid="sk" aria-label="loading row" />);
    expect(screen.getByTestId("sk")).toHaveAttribute("aria-label", "loading row");
  });
});
