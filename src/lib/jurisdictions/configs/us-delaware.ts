import type { JurisdictionConfig } from "../types";

export const usDelawareConfig: JurisdictionConfig = {
  defaultCurrency: "USD",
  entityTypes: ["LLC", "C_CORP", "S_CORP"],
  taxTypes: ["federal_income", "state_franchise", "personal_income"],
  // No US-wide VAT. Sales tax is state-level and out of scope for v0.1
  // (Delaware itself has no general sales tax). Keeping vatRules null
  // forces consumers to handle the "no VAT here" case explicitly.
  vatRules: null,
  perDiemRules: null,
  filingSchedules: [
    {
      thing: "annual_report",
      cadence: "yearly",
      dueRule: "1 March (Delaware franchise tax + report)",
    },
    {
      thing: "income_tax_return",
      cadence: "yearly",
      dueRule: "15 April (federal personal); 15 March (S-corp / partnership)",
    },
  ],
  portalLinks: [
    { label: "Delaware Division of Corporations", url: "https://corp.delaware.gov/" },
    {
      label: "IRS Online Services",
      url: "https://www.irs.gov/payments/online-account-for-individuals",
    },
  ],
  guideLinks: [
    { label: "Delaware franchise tax overview", url: "https://corp.delaware.gov/frtaxcalc/" },
    {
      label: "IRS small business hub",
      url: "https://www.irs.gov/businesses/small-businesses-self-employed",
    },
  ],
  payoutOptions: [
    { id: "salary", label: "Salary (W-2)", forEntityTypes: ["C_CORP", "S_CORP"] },
    { id: "distribution", label: "Member distribution", forEntityTypes: ["LLC"] },
    { id: "dividend", label: "Dividend", forEntityTypes: ["C_CORP"] },
  ],
  contributions: [
    { id: "fica_employer", label: "FICA (employer share)", defaultRate: 0.0765 },
    { id: "fica_employee", label: "FICA (employee share)", defaultRate: 0.0765 },
    { id: "self_employment_tax", label: "Self-employment tax", defaultRate: 0.153 },
  ],
  payoutKindDisplay: {
    salary: "Salary (W-2)",
    distribution: "Member distribution",
    dividend: "Dividend",
  },
};

export const usDelawareFreeformContextMd = `# Delaware (US-DE)

- Delaware levies an **annual franchise tax** on every domestic corporation; LLCs pay a flat \$300/year.
- No state-level VAT or general sales tax.
- C-corp profits are taxed at the entity level **and** again as dividends to shareholders ("double taxation").
- An LLC is pass-through by default; members report business income on their personal returns.
- Federal income tax filings go through the IRS; state filings (when applicable) through Delaware Division of Revenue.
`;
