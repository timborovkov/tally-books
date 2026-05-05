/**
 * Fiscal-year (FY) helpers.
 *
 * An entity's fiscal year is anchored to its `financialYearStartMonth`
 * (1-12, validated at entity creation). Reports use these helpers to
 * derive period ranges from a date + start month so the aggregation
 * queries don't have to repeat the off-by-one arithmetic.
 *
 * Label convention: an FY is named after the calendar year in which it
 * **ends**. A Jan-Dec FY for 2026 is `"FY2026"`. A Jul 2025 - Jun 2026
 * FY is also `"FY2026"`. This matches accounting convention and keeps a
 * single label unambiguous regardless of start month.
 *
 * All boundaries are UTC; no timezone arithmetic. A FY's `startUtc` is
 * midnight of day 1 of the start month; `endUtc` is the last
 * representable millisecond of the day before the next FY starts.
 */

export interface FiscalYear {
  /** "FY<year>" where <year> is the calendar year the FY ends in. */
  label: string;
  startUtc: Date;
  /** Inclusive upper bound — last ms before the next FY starts. */
  endUtc: Date;
}

export interface MonthBucket {
  /** "YYYY-MM". */
  label: string;
  startUtc: Date;
  endUtc: Date;
}

function assertFyStartMonth(m: number): void {
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`financialYearStartMonth must be an integer 1-12, got ${m}`);
  }
}

/**
 * Return the fiscal year that contains `date`.
 *
 * For an entity with `fyStartMonth = 7`:
 *   - 2025-07-15 → FY2026 (Jul 2025 .. Jun 2026)
 *   - 2025-06-30 → FY2025 (Jul 2024 .. Jun 2025)
 *   - 2026-01-01 → FY2026
 */
export function fiscalYearForDate(date: Date, fyStartMonth: number): FiscalYear {
  assertFyStartMonth(fyStartMonth);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  // The FY whose START is on or before `date`.
  const startCalendarYear = m >= fyStartMonth ? y : y - 1;
  return fiscalYearFromStartYear(startCalendarYear, fyStartMonth);
}

/**
 * Construct a fiscal year given the calendar year of its **start**.
 * Useful when iterating a known range of FYs.
 */
export function fiscalYearFromStartYear(
  startCalendarYear: number,
  fyStartMonth: number,
): FiscalYear {
  assertFyStartMonth(fyStartMonth);
  const startUtc = new Date(Date.UTC(startCalendarYear, fyStartMonth - 1, 1, 0, 0, 0, 0));
  // End = (start + 1 year) - 1ms.
  const nextStart = new Date(Date.UTC(startCalendarYear + 1, fyStartMonth - 1, 1, 0, 0, 0, 0));
  const endUtc = new Date(nextStart.getTime() - 1);
  // Label = the calendar year the FY ends in (i.e. nextStart.year if it
  // doesn't end on Jan 1, else nextStart.year too — the previous-day
  // calendar year). Simplest correct rule: take endUtc's UTC year.
  const label = `FY${endUtc.getUTCFullYear()}`;
  return { label, startUtc, endUtc };
}

/**
 * List FYs whose **start** calendar year is in `[fromYear, toYear]`,
 * inclusive. Newest first so reports default to "most recent first".
 */
export function listFiscalYears(
  fyStartMonth: number,
  fromYear: number,
  toYear: number,
): FiscalYear[] {
  assertFyStartMonth(fyStartMonth);
  if (fromYear > toYear) {
    throw new Error(`listFiscalYears: fromYear (${fromYear}) > toYear (${toYear})`);
  }
  const out: FiscalYear[] = [];
  for (let y = toYear; y >= fromYear; y--) {
    out.push(fiscalYearFromStartYear(y, fyStartMonth));
  }
  return out;
}

/**
 * Split a fiscal year into its 12 calendar-month buckets. Used by the
 * income statement's "by month" view so each bucket has a stable label
 * matching the data range.
 */
export function monthsInFiscalYear(fy: FiscalYear): MonthBucket[] {
  const out: MonthBucket[] = [];
  let cursorYear = fy.startUtc.getUTCFullYear();
  let cursorMonth = fy.startUtc.getUTCMonth(); // 0-11
  for (let i = 0; i < 12; i++) {
    const startUtc = new Date(Date.UTC(cursorYear, cursorMonth, 1, 0, 0, 0, 0));
    const nextStart = new Date(Date.UTC(cursorYear, cursorMonth + 1, 1, 0, 0, 0, 0));
    const endUtc = new Date(nextStart.getTime() - 1);
    const label = `${startUtc.getUTCFullYear()}-${String(startUtc.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ label, startUtc, endUtc });
    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }
  return out;
}
