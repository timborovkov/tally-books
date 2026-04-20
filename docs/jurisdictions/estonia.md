# Estonia (EE)

Reference for Tally's Estonia jurisdiction config. Mirrors [`src/lib/jurisdictions/configs/estonia.ts`](../../src/lib/jurisdictions/configs/estonia.ts) — that file is the source of truth.

> Tally is a calculator and a system of record. The content below is **not professional tax advice**. For filings, confirm with an Estonian accountant.

## Essentials

- **Jurisdiction code**: `EE`
- **Default currency**: `EUR`
- **Entity types supported**: `OU`, `AS`, `MTU`, `FIE`
- **Tax types modelled**: VAT, corporate income, social tax, personal income

### Entity-type quick reference

| Code    | Full name                                   | Notes                                                             |
| ------- | ------------------------------------------- | ----------------------------------------------------------------- |
| **OU**  | Osaühing — private limited company          | The common "EE company". Shareholders + board, limited liability. |
| **AS**  | Aktsiaselts — public limited company        | Larger cap, shares, board + supervisory board.                    |
| **MTU** | Mittetulundusühing — non-profit             | Non-distributing.                                                 |
| **FIE** | Füüsilisest isikust ettevõtja — sole trader | Self-employed individual; pays personal income tax on profit.     |

## VAT

- **Registration mandatory** above turnover of **€40 000**. Voluntary below.
- **Rates**:
  - Standard — **22 %**
  - Reduced — **9 %**
  - Zero — **0 %**
- **Filing**: monthly, due on the **20th** of the following month. Filed via EMTA e-MTA.

## Per diem

- **Domestic**: `null` — no Tally-tracked domestic daily rate. Estonian domestic travel is typically reimbursed as actual expenses; if per-diem-style rules apply, capture via the `foreignSource` reference.
- **Foreign**: sourced from the Estonian government regulation identifier **`vv-maaraused-2016`**. The per-day rate is jurisdiction-of-travel specific and stored against that source in the trip record.

## Filing schedules

| Thing             | Cadence | Due rule                              |
| ----------------- | ------- | ------------------------------------- |
| VAT declaration   | Monthly | 20th of the following month           |
| Annual report     | Yearly  | Within 6 months of financial-year end |
| Income tax return | Yearly  | 30 April                              |

## Payout options

For `OU` / `AS`:

- **Salary** — ordinary employment income; employer pays social tax (33 %) on top.
- **Dividend** — distribution from retained earnings. Triggers Estonia's **distribution-based corporate income tax** (deferred until paid out).
- **Board member compensation** — `board_comp`. Treated as earned income.

## Contributions

| ID                                | Label                             | Default rate |
| --------------------------------- | --------------------------------- | ------------ |
| `social_tax`                      | Social tax                        | 33 %         |
| `unemployment_insurance_employer` | Unemployment insurance (employer) | 0.8 %        |
| `unemployment_insurance_employee` | Unemployment insurance (employee) | 1.6 %        |
| `funded_pension`                  | Funded pension (II pillar)        | 2 %          |

## Portals and guides

- [EMTA e-MTA portal](https://maasikas.emta.ee/) — tax administration; VAT + income tax filings.
- [Business Register](https://ariregister.rik.ee/) — the annual report goes here, not EMTA.
- [EMTA VAT guide](https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax)
- [EMTA corporate income tax guide](https://www.emta.ee/en/business-client/taxes-and-payment/income-tax)

## Gotchas (from the config's freeform context)

- **Corporate income tax is deferred until distribution.** Retained earnings aren't taxed. Dividends are. This is the structural difference from most EU regimes — running profitable years without distribution doesn't incur an annual corporate tax bill.
- **VAT registration is mandatory above €40 000 turnover**, voluntary below. Crossing the threshold triggers a registration deadline.
- **Social tax (33 %) is employer-paid**, on top of gross salary. A gross salary of €2 000 costs the employer roughly €2 660.
- **Annual report filing path differs from tax filings.** VAT and income tax go to EMTA; the annual report goes to the Business Register. Tally surfaces both portal links on the respective declaration pages.

## Where to read next

- [`docs/data-model.md`](../data-model.md) §5.1 `jurisdictions`, §5.2 `entities`.
- [`src/lib/jurisdictions/configs/estonia.ts`](../../src/lib/jurisdictions/configs/estonia.ts) — authoritative values.
- [`src/lib/jurisdictions/types.ts`](../../src/lib/jurisdictions/types.ts) — `JurisdictionConfig` schema.
