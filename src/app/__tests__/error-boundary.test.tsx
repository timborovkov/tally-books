import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorFallback } from "@/components/error-fallback";

describe("ErrorFallback (error.tsx surface)", () => {
  it("renders the default title and description with role=alert", () => {
    render(<ErrorFallback />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/something went wrong/i);
  });

  it("shows digest when provided", () => {
    render(<ErrorFallback digest="abc123" />);
    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
  });

  it("retry button invokes the reset callback", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorFallback onRetry={reset} />);

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when no handler provided", () => {
    render(<ErrorFallback />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
