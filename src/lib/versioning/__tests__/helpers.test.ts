import { describe, expect, it } from "vitest";

import { pickSnapshot } from "@/lib/versioning/helpers";

describe("pickSnapshot", () => {
  it("includes only fields from the allowlist", () => {
    const out = pickSnapshot({ vendor: "Lidl", secret: "x", amount: "9.99" }, [
      "vendor",
      "amount",
    ] as const);
    expect(out).toEqual({ vendor: "Lidl", amount: "9.99" });
  });

  it("normalises Date values to ISO strings so JSON round-trips don't drift", () => {
    const d = new Date("2026-04-20T00:00:00Z");
    const out = pickSnapshot({ occurredAt: d }, ["occurredAt"] as const);
    expect(out).toEqual({ occurredAt: "2026-04-20T00:00:00.000Z" });
  });

  it("preserves explicit null", () => {
    expect(pickSnapshot({ notes: null }, ["notes"] as const)).toEqual({ notes: null });
  });

  it("coerces undefined to null", () => {
    expect(
      pickSnapshot({ notes: undefined } as unknown as { notes: unknown }, ["notes"] as const),
    ).toEqual({ notes: null });
  });

  it("passes numeric-as-string through untouched (Postgres numeric shape)", () => {
    expect(pickSnapshot({ amount: "9.9900" }, ["amount"] as const)).toEqual({
      amount: "9.9900",
    });
  });

  it("passes nested objects through by reference shape", () => {
    const nested = { city: "Tallinn", postcode: "10111" };
    const out = pickSnapshot({ address: nested }, ["address"] as const);
    expect(out).toEqual({ address: nested });
  });
});
