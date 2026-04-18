import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuickAddButton } from "@/components/quick-add/quick-add-button";
import { QuickAddDialog } from "@/components/quick-add/quick-add-dialog";

describe("QuickAddButton + Dialog", () => {
  it("opens the dialog and renders four action cards", async () => {
    const user = userEvent.setup();
    render(<QuickAddButton />);

    await user.click(screen.getByRole("button", { name: /quick add/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Four stub actions — matches the ACTIONS constant.
    expect(screen.getByRole("button", { name: /new expense/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload receipt/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new invoice draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new trip/i })).toBeInTheDocument();
  });

  it("Escape closes the dialog", async () => {
    const user = userEvent.setup();
    render(<QuickAddButton />);

    await user.click(screen.getByRole("button", { name: /quick add/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    // Radix unmounts the dialog after close animation.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selecting an action closes the dialog and logs the selection", async () => {
    const user = userEvent.setup();
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const onOpenChange = vi.fn();

    render(<QuickAddDialog open={true} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /new expense/i }));

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("expense"));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    logSpy.mockRestore();
  });
});
