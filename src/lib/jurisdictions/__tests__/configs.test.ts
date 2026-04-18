import { describe, expect, it } from "vitest";

import { prefilledJurisdictions } from "@/lib/jurisdictions";
import { jurisdictionConfigSchema, parseJurisdictionConfig } from "@/lib/jurisdictions/types";

describe("prefilled jurisdiction configs", () => {
  for (const j of prefilledJurisdictions) {
    it(`${j.code} parses against jurisdictionConfigSchema`, () => {
      expect(() => parseJurisdictionConfig(j.config)).not.toThrow();
    });
  }

  it("includes EE, FI, US-DE", () => {
    const codes = prefilledJurisdictions.map((j) => j.code).sort();
    expect(codes).toEqual(["EE", "FI", "US-DE"]);
  });
});

describe("jurisdictionConfigSchema", () => {
  it("rejects a config missing entityTypes", () => {
    const bad = { defaultCurrency: "EUR" };
    const result = jurisdictionConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("entityTypes");
    }
  });

  it("rejects a config with empty entityTypes", () => {
    const bad = {
      defaultCurrency: "EUR",
      entityTypes: [],
      vatRules: null,
      perDiemRules: null,
    };
    expect(jurisdictionConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a VAT rate above 1.0 (must be a fraction, not a percent)", () => {
    const bad = {
      defaultCurrency: "EUR",
      entityTypes: ["X"],
      vatRules: {
        registrationRequired: true,
        registrationThreshold: null,
        rates: [{ id: "weird", label: "weird", rate: 22 }],
      },
      perDiemRules: null,
    };
    expect(jurisdictionConfigSchema.safeParse(bad).success).toBe(false);
  });
});
