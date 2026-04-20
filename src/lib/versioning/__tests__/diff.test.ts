import { describe, expect, it } from "vitest";

import { applyPatch, createPatch } from "@/lib/versioning/diff";

describe("versioning/diff", () => {
  it("produces an empty patch for identical snapshots", () => {
    const snap = { vendor: "Lidl", amount: "9.99", currency: "EUR" };
    expect(createPatch(snap, snap)).toEqual([]);
  });

  it("round-trips a snapshot through createPatch + applyPatch", () => {
    const from = { vendor: "Lidl", amount: "9.99", currency: "EUR" };
    const to = { vendor: "Prisma", amount: "12.50", currency: "EUR" };
    const patch = createPatch(from, to);
    expect(applyPatch(from, patch)).toEqual(to);
  });

  it("does not mutate the `from` snapshot passed to createPatch", () => {
    const from = { vendor: "Lidl", amount: "9.99" };
    const to = { vendor: "Prisma", amount: "12.50" };
    const frozen = structuredClone(from);
    createPatch(from, to);
    expect(from).toEqual(frozen);
  });

  it("does not mutate the base snapshot passed to applyPatch", () => {
    const base = { vendor: "Lidl" };
    const frozen = structuredClone(base);
    applyPatch(base, [{ op: "replace", path: "/vendor", value: "Prisma" }]);
    expect(base).toEqual(frozen);
  });

  it("captures nested changes", () => {
    const from = { address: { city: "Helsinki", postcode: "00100" } };
    const to = { address: { city: "Tallinn", postcode: "10111" } };
    const patch = createPatch(from, to);
    expect(applyPatch(from, patch)).toEqual(to);
  });

  it("throws on unapplicable patches", () => {
    expect(() =>
      applyPatch({}, [{ op: "replace", path: "/missing/nested", value: 1 }]),
    ).toThrow(/applyPatch failed/);
  });
});
