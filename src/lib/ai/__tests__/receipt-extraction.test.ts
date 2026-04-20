import { describe, expect, it } from "vitest";

import { receiptExtraction } from "@/lib/ai/schemas/receipt-extraction";

describe("ai/schemas/receipt-extraction", () => {
  const canned = {
    vendor: { value: "Prisma", confidence: 0.92 },
    occurredAt: { value: "2026-04-20T12:15:00Z", confidence: 0.98 },
    amount: { value: "12.5000", confidence: 0.95 },
    currency: { value: "EUR", confidence: 0.99 },
    taxLines: [{ rate: "24%", base: "10.0800", tax: "2.4200", confidence: 0.9 }],
    categoryHint: "groceries",
    notes: null,
    overallConfidence: 0.9,
  };

  it("accepts a well-formed extraction", () => {
    const result = receiptExtraction.parse(canned);
    expect(result.vendor.value).toBe("Prisma");
    expect(result.amount.value).toBe("12.5000");
  });

  it("accepts nulls for absent fields", () => {
    const result = receiptExtraction.parse({
      ...canned,
      vendor: { value: null, confidence: 0 },
      amount: { value: null, confidence: 0 },
      taxLines: null,
      categoryHint: null,
    });
    expect(result.vendor.value).toBeNull();
    expect(result.taxLines).toBeNull();
  });

  it("rejects amounts with too many fractional digits", () => {
    expect(() =>
      receiptExtraction.parse({
        ...canned,
        amount: { value: "12.12345", confidence: 0.95 },
      }),
    ).toThrow();
  });

  it("rejects non-ISO currency", () => {
    expect(() =>
      receiptExtraction.parse({
        ...canned,
        currency: { value: "euros", confidence: 0.95 },
      }),
    ).toThrow();
  });

  it("rejects confidences outside [0, 1]", () => {
    expect(() =>
      receiptExtraction.parse({
        ...canned,
        vendor: { value: "x", confidence: 1.5 },
      }),
    ).toThrow();
  });

  it("rejects unparseable occurredAt strings", () => {
    expect(() =>
      receiptExtraction.parse({
        ...canned,
        occurredAt: { value: "not-a-date", confidence: 0.5 },
      }),
    ).toThrow();
  });
});
