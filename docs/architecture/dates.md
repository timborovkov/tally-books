# Dates and times

**Rule: all times in Tally are stored, computed, and displayed in UTC.**

No feature code constructs a raw `Date` for "now", calls `Date.now()`, or uses `toLocale*` formatters. The host timezone is explicitly not trusted — the app may run on a server in any region, and a date displayed in Helsinki must match the same date displayed in Tallinn.

## The helpers

All UTC operations go through [`src/lib/dates.ts`](../../src/lib/dates.ts).

| Helper                       | Use it for                                      |
| ---------------------------- | ----------------------------------------------- |
| `nowUtc()`                   | Getting "the current instant" as a `Date`       |
| `nowUtcMs()`                 | Replacement for `Date.now()` (epoch ms)         |
| `toIsoUtc(d)`                | Serialising to ISO-8601 with `Z` suffix         |
| `formatUtcDate(d)`           | Display: `YYYY-MM-DD`                           |
| `formatUtcDateTime(d)`       | Display: `YYYY-MM-DD HH:mm:ss UTC`              |
| `startOfUtcDay(d)`           | Range-query bounds (inclusive lower)            |
| `endOfUtcDay(d)`             | Range-query bounds (inclusive upper, `.999` ms) |
| `parseUtcDate("2026-04-18")` | Parse user-entered date strings (form input)    |

For elapsed-time measurements (perf timing), use `performance.now()` directly. `nowUtcMs()` is for wall-clock time.

## Enforcement

[`eslint.config.mjs`](../../eslint.config.mjs) has `no-restricted-syntax` rules that fail the build on:

- Any `.toLocaleString()` / `.toLocaleDateString()` / `.toLocaleTimeString()` call
- Any `Date.now()` call

Overrides apply only to `src/lib/dates.ts` (the sanctioned implementation) and test files (which construct fixture dates).

Raw `new Date()` and `new Date(someInput)` are allowed because the ecosystem relies on them for deserialisation. The convention is: if you're making one to represent "now", use `nowUtc()` — `grep nowUtc` then gives you the full inventory of wall-clock touchpoints.

## Adding a new helper

1. Implement it in `src/lib/dates.ts`. All Intl formatters must pass `{ timeZone: "UTC" }`.
2. Cover it with a test in `src/lib/__tests__/dates.test.ts`. Assert exact output, not "returns a string". Include an edge case that would fail if the helper used local time.
3. Export it. Consumers import via `@/lib/dates`.

## Why not date-fns / luxon?

Both are fine libraries, but everything Tally currently needs (ISO serialisation, UTC day boundaries, `YYYY-MM-DD` formatting) is a one-liner against native `Date` + `Intl.DateTimeFormat`. We add a dep when we encounter the first calculation that's genuinely painful without one — not preemptively.
