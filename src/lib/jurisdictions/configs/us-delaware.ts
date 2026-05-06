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
  // Standard small-business expense CoA. No nationally-mandated scheme
  // in the US, so codes are omitted — users can map to their own CPA's
  // chart later. COGS first (Schedule C line 4 territory) then SG&A
  // categories most US small businesses report on Schedule C / 1120-S.
  defaultCategories: [
    { key: "us_cogs", kind: "expense", name: "Cost of Goods Sold" },
    { key: "us_salaries", kind: "expense", name: "Salaries & Wages" },
    { key: "us_rent", kind: "expense", name: "Rent" },
    { key: "us_utilities", kind: "expense", name: "Utilities" },
    { key: "us_office_supplies", kind: "expense", name: "Office Supplies" },
    { key: "us_travel", kind: "expense", name: "Travel" },
    { key: "us_meals", kind: "expense", name: "Meals" },
    { key: "us_professional_fees", kind: "expense", name: "Professional Fees" },
    { key: "us_software", kind: "expense", name: "Software & Subscriptions" },
    { key: "us_bank_fees", kind: "expense", name: "Bank Charges" },
    { key: "us_other", kind: "expense", name: "Other Expenses" },
  ],
};

export const usDelawareFreeformContextMd = `# Delaware (US-DE)

- Delaware levies an **annual franchise tax** on every domestic corporation; LLCs pay a flat \$300/year.
- No state-level VAT or general sales tax.
- C-corp profits are taxed at the entity level **and** again as dividends to shareholders ("double taxation").
- An LLC is pass-through by default; members report business income on their personal returns.
- Federal income tax filings go through the IRS; state filings (when applicable) through Delaware Division of Revenue.
`;
