import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReceiptForm } from "@/components/settings/ReceiptForm";
import type { Entity, Receipt } from "@/db/schema";

function mockEntities(overrides: Partial<Entity>[] = []) {
  const base: Pick<Entity, "id" | "name" | "baseCurrency">[] = [
    { id: "e_1", name: "Demo OÜ", baseCurrency: "EUR" },
  ];
  return overrides.length > 0
    ? (overrides as Pick<Entity, "id" | "name" | "baseCurrency">[])
    : base;
}

function mockReceipt(overrides: Partial<Receipt> = {}): Receipt {
  const now = new Date("2026-04-20T00:00:00Z");
  return {
    id: "rcp_1",
    entityId: "e_1",
    occurredAt: new Date("2026-03-15T00:00:00Z"),
    vendor: "Lidl",
    amount: "9.9900",
    currency: "EUR",
    notes: "lunch receipt",
    blobId: null,
    currentVersionId: "ver_1",
    state: "draft",
    autoRefreshLocked: false,
    refreshPending: false,
    underlyingDataChanged: false,
    underlyingDataChangedPayload: null,
    filedRef: null,
    filedAt: null,
    disclaimerDismissedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ReceiptForm — create mode", () => {
  it("renders no hidden id and no reason field", () => {
    const { container } = render(
      <ReceiptForm
        entities={mockEntities()}
        receipt={null}
        action={vi.fn()}
        submitLabel="Create receipt"
      />,
    );
    expect(container.querySelector('input[name="id"]')).toBeNull();
    expect(screen.queryByLabelText(/change reason/i)).toBeNull();
  });

  it("currency defaults to the first entity's baseCurrency", () => {
    render(
      <ReceiptForm
        entities={[{ id: "e_1", name: "SEK Co", baseCurrency: "SEK" }]}
        receipt={null}
        action={vi.fn()}
        submitLabel="Create"
      />,
    );
    expect((screen.getByLabelText(/currency/i) as HTMLInputElement).value).toBe("SEK");
  });

  it("falls back to EUR when there are no entities", () => {
    render(<ReceiptForm entities={[]} receipt={null} action={vi.fn()} submitLabel="Create" />);
    expect((screen.getByLabelText(/currency/i) as HTMLInputElement).value).toBe("EUR");
  });

  it("submit button uses the given label", () => {
    render(
      <ReceiptForm
        entities={mockEntities()}
        receipt={null}
        action={vi.fn()}
        submitLabel="Create receipt"
      />,
    );
    expect(screen.getByRole("button", { name: "Create receipt" })).toBeInTheDocument();
  });
});

describe("ReceiptForm — edit mode", () => {
  it("renders a hidden id and the reason field", () => {
    const receipt = mockReceipt();
    const { container } = render(
      <ReceiptForm
        entities={mockEntities()}
        receipt={receipt}
        action={vi.fn()}
        submitLabel="Save"
      />,
    );
    const hidden = container.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe("rcp_1");
    expect(screen.getByLabelText(/change reason/i)).toBeInTheDocument();
  });

  it("prefills vendor/amount/notes and sets occurredAt as YYYY-MM-DD", () => {
    const receipt = mockReceipt();
    render(
      <ReceiptForm
        entities={mockEntities()}
        receipt={receipt}
        action={vi.fn()}
        submitLabel="Save"
      />,
    );
    expect((screen.getByLabelText(/vendor/i) as HTMLInputElement).value).toBe("Lidl");
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe("9.9900");
    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe("lunch receipt");
    expect((screen.getByLabelText(/date/i) as HTMLInputElement).value).toBe("2026-03-15");
  });

  it("currency prefers receipt.currency over entity.baseCurrency", () => {
    const receipt = mockReceipt({ currency: "USD" });
    render(
      <ReceiptForm
        entities={[{ id: "e_1", name: "EUR Co", baseCurrency: "EUR" }]}
        receipt={receipt}
        action={vi.fn()}
        submitLabel="Save"
      />,
    );
    expect((screen.getByLabelText(/currency/i) as HTMLInputElement).value).toBe("USD");
  });
});
