import type { JurisdictionConfig } from "../types";

export const finlandConfig: JurisdictionConfig = {
  defaultCurrency: "EUR",
  entityTypes: ["TOIMINIMI", "OY", "AY", "KY"],
  taxTypes: ["vat", "corporate_income", "personal_income", "yel"],
  vatRules: {
    registrationRequired: true,
    registrationThreshold: 20_000,
    rates: [
      { id: "standard", label: "Standard 25.5 %", rate: 0.255 },
      { id: "reduced_14", label: "Reduced 14 %", rate: 0.14 },
      { id: "reduced_10", label: "Reduced 10 %", rate: 0.1 },
      { id: "zero", label: "Zero 0 %", rate: 0 },
    ],
  },
  perDiemRules: {
    domestic: 51,
    foreignSource: "vero-paivaraha",
  },
  filingSchedules: [
    {
      thing: "vat_declaration",
      cadence: "monthly",
      dueRule: "12th of the second month after the period (cadence depends on registration)",
    },
    {
      thing: "income_tax_return",
      cadence: "yearly",
      dueRule: "Pre-filled return verified by April–May",
    },
  ],
  portalLinks: [
    { label: "Vero MyTax (OmaVero)", url: "https://www.vero.fi/en/e-file/mytax/" },
    { label: "PRH Trade Register", url: "https://www.prh.fi/en/kaupparekisteri.html" },
  ],
  guideLinks: [
    {
      label: "Vero VAT guidance",
      url: "https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/",
    },
    {
      label: "Vero per diem rates",
      url: "https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/income/earned-income/business-trip/",
    },
    { label: "YEL pension info", url: "https://www.elakeskus.fi/en/yel" },
  ],
  payoutOptions: [
    { id: "salary", label: "Salary", forEntityTypes: ["OY"] },
    { id: "dividend", label: "Dividend", forEntityTypes: ["OY"] },
    {
      id: "yksittaisotto",
      label: "Private withdrawal (yksittäisotto)",
      forEntityTypes: ["TOIMINIMI"],
      notes: "Toiminimi owner withdraws from business funds — not a salary.",
    },
  ],
  contributions: [
    {
      id: "yel",
      label: "YEL self-employed pension",
      notes: "Rate depends on age and confirmed YEL income.",
    },
    { id: "tyel", label: "TyEL employee pension", defaultRate: 0.246 },
    {
      id: "social_security_employer",
      label: "Employer's health insurance contribution",
      defaultRate: 0.0153,
    },
  ],
  payoutKindDisplay: {
    salary: "Palkka",
    dividend: "Osinko",
    yksittaisotto: "Yksittäisotto",
  },
  // Subset of Kirjanpitoasetus expense classes. No account codes here —
  // the Finnish CoA isn't a single national scheme (each chart of
  // accounts vendor numbers them slightly differently), so leaving
  // codes blank lets the user fill them to match their bookkeeper's
  // chart.
  defaultCategories: [
    { key: "fi_materials", kind: "expense", name: "Aine- ja tarvikeostot / Materials" },
    { key: "fi_personnel", kind: "expense", name: "Henkilöstökulut / Personnel" },
    { key: "fi_premises", kind: "expense", name: "Toimitilat / Premises" },
    { key: "fi_travel", kind: "expense", name: "Matkakulut / Travel" },
    { key: "fi_marketing", kind: "expense", name: "Markkinointi / Marketing" },
    {
      key: "fi_bank_fees",
      kind: "expense",
      name: "Pankki- ja rahoituskulut / Bank & finance fees",
    },
    { key: "fi_admin", kind: "expense", name: "Hallinto / Administration" },
    { key: "fi_other", kind: "expense", name: "Muut liikekulut / Other operating expenses" },
  ],
};

export const finlandFreeformContextMd = `# Finland (FI)

- VAT default rate raised to **25.5 %** in September 2024.
- A toiminimi (sole trader) is not a separate legal person — owner pays personal income tax on profit, not corporate tax.
- YEL pension contributions are mandatory above the income threshold; they're a deductible expense and feed into pension + sickness benefits.
- Per diem rates are set yearly by Vero and apply both to employees and toiminimi-owners.
`;
