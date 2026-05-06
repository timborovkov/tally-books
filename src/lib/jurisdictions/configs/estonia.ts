import type { JurisdictionConfig } from "../types";

export const estoniaConfig: JurisdictionConfig = {
  defaultCurrency: "EUR",
  entityTypes: ["OU", "AS", "MTU", "FIE"],
  taxTypes: ["vat", "corporate_income", "social_tax", "personal_income"],
  vatRules: {
    registrationRequired: true,
    registrationThreshold: 40_000,
    rates: [
      { id: "standard", label: "Standard 22 %", rate: 0.22 },
      { id: "reduced", label: "Reduced 9 %", rate: 0.09 },
      { id: "zero", label: "Zero 0 %", rate: 0 },
    ],
  },
  perDiemRules: {
    domestic: null,
    foreignSource: "vv-maaraused-2016",
  },
  filingSchedules: [
    { thing: "vat_declaration", cadence: "monthly", dueRule: "20th of the following month" },
    { thing: "annual_report", cadence: "yearly", dueRule: "Within 6 months of FY end" },
    { thing: "income_tax_return", cadence: "yearly", dueRule: "30 April" },
  ],
  portalLinks: [
    { label: "EMTA e-MTA portal", url: "https://maasikas.emta.ee/" },
    { label: "Business Register", url: "https://ariregister.rik.ee/" },
  ],
  guideLinks: [
    {
      label: "EMTA VAT guide",
      url: "https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax",
    },
    {
      label: "EMTA corporate income tax",
      url: "https://www.emta.ee/en/business-client/taxes-and-payment/income-tax",
    },
  ],
  payoutOptions: [
    { id: "salary", label: "Salary", forEntityTypes: ["OU", "AS"] },
    { id: "dividend", label: "Dividend", forEntityTypes: ["OU", "AS"] },
    { id: "board_comp", label: "Board member compensation", forEntityTypes: ["OU", "AS"] },
  ],
  contributions: [
    { id: "social_tax", label: "Social tax", defaultRate: 0.33 },
    {
      id: "unemployment_insurance_employer",
      label: "Unemployment insurance (employer)",
      defaultRate: 0.008,
    },
    {
      id: "unemployment_insurance_employee",
      label: "Unemployment insurance (employee)",
      defaultRate: 0.016,
    },
    { id: "funded_pension", label: "Funded pension (II pillar)", defaultRate: 0.02 },
  ],
  payoutKindDisplay: {
    salary: "Salary",
    dividend: "Dividend",
    board_comp: "Board member fee",
  },
  // Estonian raamatupidamise seadus uses a 4-digit account scheme;
  // 4xxx = goods/materials, 5xxx = operating expenses. Bilingual names
  // (Estonian / English) so the user sees both — the seeded rows are
  // editable, so anyone who prefers one language can rename freely.
  defaultCategories: [
    { key: "ee_materials", kind: "expense", code: "4000", name: "Materjalid / Materials" },
    { key: "ee_personnel", kind: "expense", code: "5000", name: "Tööjõukulud / Personnel" },
    { key: "ee_rent", kind: "expense", code: "5100", name: "Üür / Rent" },
    {
      key: "ee_communications",
      kind: "expense",
      code: "5200",
      name: "Kommunikatsioon / Communications",
    },
    { key: "ee_travel", kind: "expense", code: "5300", name: "Reisikulud / Travel" },
    { key: "ee_bank_fees", kind: "expense", code: "5400", name: "Pangateenused / Bank fees" },
    {
      key: "ee_accounting_legal",
      kind: "expense",
      code: "5500",
      name: "Raamatupidamine / Accounting & legal",
    },
    {
      key: "ee_other_operating",
      kind: "expense",
      code: "5900",
      name: "Muud tegevuskulud / Other operating expenses",
    },
  ],
};

export const estoniaFreeformContextMd = `# Estonia (EE)

- Corporate income tax is **deferred until distribution** — retained earnings are not taxed, dividends are.
- VAT registration mandatory above €40 000 turnover; voluntary below.
- Social tax (33 %) is paid by the employer on top of gross salary.
- Annual report is filed via the Business Register portal, not EMTA.
`;
