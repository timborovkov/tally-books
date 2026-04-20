# Finland (FI)

Reference for Tally's Finland jurisdiction config. Mirrors [`src/lib/jurisdictions/configs/finland.ts`](../../src/lib/jurisdictions/configs/finland.ts) — that file is the source of truth.

> Tally is a calculator and a system of record. The content below is **not professional tax advice**. For filings, confirm with a Finnish accountant.

## Essentials

- **Jurisdiction code**: `FI`
- **Default currency**: `EUR`
- **Entity types supported**: `TOIMINIMI`, `OY`, `AY`, `KY`
- **Tax types modelled**: VAT, corporate income, personal income, YEL

### Entity-type quick reference

| Code           | Full name                                  | Notes                                                                |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| **TOIMINIMI**  | Sole trader                                | **Not a separate legal person**. Profit is personal income.          |
| **OY**         | Osakeyhtiö — private limited company        | The common "FI company". Shareholders + board, limited liability.    |
| **AY**         | Avoin yhtiö — general partnership           | Two+ partners, unlimited liability.                                  |
| **KY**         | Kommandiittiyhtiö — limited partnership     | At least one general partner (unlimited) + limited partners.         |

## VAT

- **Registration mandatory** above turnover of **€20 000**.
- **Rates** (standard rate raised in September 2024):
  - Standard — **25.5 %**
  - Reduced — **14 %**
  - Reduced — **10 %**
  - Zero — **0 %**
- **Filing cadence** depends on registration type. The standard monthly cadence is due on the **12th of the second month after the period** (e.g. June declaration due 12 August). Filed via Vero MyTax (OmaVero).

## Per diem

- **Domestic**: **€51 / day** (the config's default; Vero publishes the current figure annually).
- **Foreign**: sourced from the Vero per-diem rate table under identifier **`vero-paivaraha`**. The foreign rate is destination-specific; Tally stores the reference and the trip's destination and resolves the rate against the current table.

## Filing schedules

| Thing             | Cadence | Due rule                                                                      |
| ----------------- | ------- | ----------------------------------------------------------------------------- |
| VAT declaration   | Monthly | 12th of the second month after the period (cadence depends on registration). |
| Income tax return | Yearly  | Pre-filled return verified by April–May.                                      |

## Payout options

- **Salary** — for `OY` only. Regular employment income.
- **Dividend** — for `OY` only. Tax treatment depends on distributable funds vs mathematical value of shares (ask an accountant for the split).
- **Yksittäisotto (private withdrawal)** — for `TOIMINIMI` only. The toiminimi owner withdraws from business funds; it's not a salary and doesn't incur employer contributions — the owner pays personal income tax on the business profit as a whole.

## Contributions

| ID                           | Label                                       | Default rate |
| ---------------------------- | ------------------------------------------- | ------------ |
| `yel`                        | YEL self-employed pension                    | Age- and income-dependent — no single default. |
| `tyel`                       | TyEL employee pension                        | 24.6 %       |
| `social_security_employer`   | Employer's health insurance contribution      | 1.53 %       |

**YEL** is mandatory above the income threshold for toiminimi / self-employed. The rate depends on age bracket and confirmed YEL income (the figure you declare, which feeds into future pension + sickness benefits). It's a deductible expense.

## Portals and guides

- [Vero MyTax (OmaVero)](https://www.vero.fi/en/e-file/mytax/) — tax administration; VAT, income tax, withholding.
- [PRH Trade Register](https://www.prh.fi/en/kaupparekisteri.html) — entity registration + annual filings.
- [Vero VAT guidance](https://www.vero.fi/en/businesses-and-corporations/taxes-and-charges/vat/)
- [Vero per diem rates](https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/income/earned-income/business-trip/)
- [YEL pension info](https://www.elakeskus.fi/en/yel)

## Gotchas (from the config's freeform context)

- **VAT default rate raised to 25.5 % in September 2024.** Existing declarations dated pre-September 2024 use the old 24 % rate; Tally stores the rate on each line so historical periods stay accurate.
- **A toiminimi is not a separate legal person.** The owner pays personal income tax on profit, not corporate tax. This changes the payout model (yksittäisotto), the filing cadence (personal return instead of corporate), and the liability model.
- **YEL is mandatory above the income threshold** for self-employed. Contributions are a deductible expense and feed into pension + sickness benefits. Running a toiminimi without paying YEL is a common compliance gap.
- **Per diem rates are set yearly by Vero.** The config references the source; rate updates are a config change, not a schema change. Rates apply to both employees and toiminimi owners on business trips.

## Where to read next

- [`docs/data-model.md`](../data-model.md) §5.1 `jurisdictions`, §5.2 `entities`.
- [`src/lib/jurisdictions/configs/finland.ts`](../../src/lib/jurisdictions/configs/finland.ts) — authoritative values.
- [`src/lib/jurisdictions/types.ts`](../../src/lib/jurisdictions/types.ts) — `JurisdictionConfig` schema.
