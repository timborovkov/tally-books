# Delaware (US-DE)

Reference for Tally's Delaware jurisdiction config. Mirrors [`src/lib/jurisdictions/configs/us-delaware.ts`](../../src/lib/jurisdictions/configs/us-delaware.ts) — that file is the source of truth.

> Tally is a calculator and a system of record. The content below is **not professional tax advice**. For filings, confirm with a US CPA.

## Essentials

- **Jurisdiction code**: `US-DE`
- **Default currency**: `USD`
- **Entity types supported**: `LLC`, `C_CORP`, `S_CORP`
- **Tax types modelled**: federal income, state franchise, personal income

### Entity-type quick reference

| Code        | Full name                   | Notes                                                                 |
| ----------- | --------------------------- | --------------------------------------------------------------------- |
| **LLC**     | Limited Liability Company    | Pass-through by default (members report income personally). Flat $300/year Delaware LLC tax. |
| **C_CORP**  | C corporation                | Taxed at entity level; distributions to shareholders are taxed again (double taxation). |
| **S_CORP**  | S corporation                | Pass-through for federal tax, with shareholder and ownership limits.  |

## VAT / Sales tax

**Not modelled.** There is no US-wide VAT, and Delaware has no general state sales tax. `vatRules` is `null` in the config so consumers handle the "no VAT here" case explicitly rather than silently inheriting a default. If you sell into other states that levy sales tax, that's a separate tax nexus problem Tally does not handle today.

## Per diem

**Not modelled.** `perDiemRules` is `null`. US federal per-diem (GSA CONUS rates, IRS high-low) can be added if Tally grows a US trip-expense feature — the config shape accommodates it.

## Filing schedules

| Thing             | Cadence | Due rule                                                                      |
| ----------------- | ------- | ----------------------------------------------------------------------------- |
| Annual report     | Yearly  | 1 March (Delaware franchise tax + annual report).                             |
| Income tax return | Yearly  | 15 April (federal personal); 15 March (S-corp / partnership).                 |

Delaware's franchise tax and annual report are filed together via the Division of Corporations. Federal income tax goes to the IRS.

## Payout options

- **Salary (W-2)** — `salary`. For `C_CORP` and `S_CORP`. Wages reported on Form W-2; FICA withheld.
- **Member distribution** — `distribution`. For `LLC` only. Pass-through: members report business income on their personal return.
- **Dividend** — `dividend`. For `C_CORP` only. After-tax profit distribution; subject to qualified-dividend rules at the shareholder level.

## Contributions

| ID                     | Label                       | Default rate |
| ---------------------- | --------------------------- | ------------ |
| `fica_employer`        | FICA (employer share)        | 7.65 %       |
| `fica_employee`        | FICA (employee share)        | 7.65 %       |
| `self_employment_tax`  | Self-employment tax          | 15.3 %       |

FICA = Social Security (6.2 %) + Medicare (1.45 %). The self-employment tax (15.3 %) is the combined employer+employee share that a self-employed person pays themselves.

## Portals and guides

- [Delaware Division of Corporations](https://corp.delaware.gov/) — franchise tax + annual report filings.
- [IRS Online Services](https://www.irs.gov/payments/online-account-for-individuals) — federal personal tax.
- [Delaware franchise tax overview](https://corp.delaware.gov/frtaxcalc/) — calculates the authorized-shares method vs assumed-par method for C-corps.
- [IRS small business hub](https://www.irs.gov/businesses/small-businesses-self-employed)

## Gotchas (from the config's freeform context)

- **Delaware levies an annual franchise tax** on every domestic corporation; LLCs pay a flat **$300/year**. Miss the 1 March deadline and you start accruing penalties + interest; Delaware will administratively dissolve an entity that lets its franchise tax lapse.
- **No state-level VAT or general sales tax.** If you physically sell goods in other states or ship into them, nexus rules for those states' sales tax apply — out of scope for Tally's Delaware config.
- **C-corp profits are taxed twice.** Once at the entity level (federal + state franchise), again as dividends to shareholders. Most small businesses choose `LLC` or `S_CORP` to avoid this; Delaware is popular specifically because the `C_CORP` double taxation is offset by investor-friendly governance law.
- **LLC is pass-through by default.** Members report business income on their personal federal return. An LLC can elect to be taxed as a C-corp (Form 8832) — Tally doesn't model that election yet.
- **Filing paths diverge.** Federal income tax → IRS. State filings (when applicable for payroll, withholding) → Delaware Division of Revenue. Franchise tax + annual report → Delaware Division of Corporations. Three separate portals.

## Where to read next

- [`docs/data-model.md`](../data-model.md) §5.1 `jurisdictions`, §5.2 `entities`.
- [`src/lib/jurisdictions/configs/us-delaware.ts`](../../src/lib/jurisdictions/configs/us-delaware.ts) — authoritative values.
- [`src/lib/jurisdictions/types.ts`](../../src/lib/jurisdictions/types.ts) — `JurisdictionConfig` schema.
