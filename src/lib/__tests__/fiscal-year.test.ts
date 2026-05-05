import { describe, expect, it } from "vitest";

import {
  fiscalYearForDate,
  fiscalYearFromStartYear,
  listFiscalYears,
  monthsInFiscalYear,
} from "@/lib/fiscal-year";

describe("fiscalYearForDate", () => {
  it("Jan-Dec FY: 2026-05-15 → FY2026", () => {
    const fy = fiscalYearForDate(new Date("2026-05-15T00:00:00Z"), 1);
    expect(fy.label).toBe("FY2026");
    expect(fy.startUtc.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(fy.endUtc.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("Jul-Jun FY: 2025-07-15 → FY2026", () => {
    const fy = fiscalYearForDate(new Date("2025-07-15T00:00:00Z"), 7);
    expect(fy.label).toBe("FY2026");
    expect(fy.startUtc.toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(fy.endUtc.toISOString()).toBe("2026-06-30T23:59:59.999Z");
  });

  it("Jul-Jun FY: 2025-06-30 → FY2025 (boundary day before next FY)", () => {
    const fy = fiscalYearForDate(new Date("2025-06-30T23:59:59Z"), 7);
    expect(fy.label).toBe("FY2025");
    expect(fy.startUtc.toISOString()).toBe("2024-07-01T00:00:00.000Z");
  });

  it("Apr-Mar FY: 2026-01-01 → FY2026 (still in the FY that ends in 2026)", () => {
    const fy = fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), 4);
    expect(fy.label).toBe("FY2026");
    expect(fy.startUtc.toISOString()).toBe("2025-04-01T00:00:00.000Z");
    expect(fy.endUtc.toISOString()).toBe("2026-03-31T23:59:59.999Z");
  });

  it("rejects invalid fyStartMonth", () => {
    expect(() => fiscalYearForDate(new Date(), 0)).toThrow();
    expect(() => fiscalYearForDate(new Date(), 13)).toThrow();
    expect(() => fiscalYearForDate(new Date(), 1.5)).toThrow();
  });
});

describe("fiscalYearFromStartYear", () => {
  it("Jan-Dec 2025 → FY2025", () => {
    const fy = fiscalYearFromStartYear(2025, 1);
    expect(fy.label).toBe("FY2025");
    expect(fy.startUtc.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(fy.endUtc.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });

  it("end is exactly 1ms before next FY start", () => {
    const fy = fiscalYearFromStartYear(2025, 7);
    const next = fiscalYearFromStartYear(2026, 7);
    expect(next.startUtc.getTime() - fy.endUtc.getTime()).toBe(1);
  });
});

describe("listFiscalYears", () => {
  it("returns newest first across the requested range", () => {
    const ys = listFiscalYears(1, 2024, 2026);
    expect(ys.map((y) => y.label)).toEqual(["FY2026", "FY2025", "FY2024"]);
  });

  it("rejects fromYear > toYear", () => {
    expect(() => listFiscalYears(1, 2027, 2026)).toThrow();
  });
});

describe("monthsInFiscalYear", () => {
  it("Jan-Dec FY produces 12 calendar-aligned months", () => {
    const fy = fiscalYearFromStartYear(2026, 1);
    const months = monthsInFiscalYear(fy);
    expect(months).toHaveLength(12);
    expect(months[0]!.label).toBe("2026-01");
    expect(months[11]!.label).toBe("2026-12");
    expect(months[0]!.startUtc.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(months[11]!.endUtc.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("Jul-Jun FY straddles two calendar years", () => {
    const fy = fiscalYearFromStartYear(2025, 7);
    const months = monthsInFiscalYear(fy);
    expect(months[0]!.label).toBe("2025-07");
    expect(months[5]!.label).toBe("2025-12");
    expect(months[6]!.label).toBe("2026-01");
    expect(months[11]!.label).toBe("2026-06");
  });
});
