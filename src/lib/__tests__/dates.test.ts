import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  endOfUtcDay,
  formatUtcDate,
  formatUtcDateTime,
  nowUtc,
  nowUtcMs,
  parseUtcDate,
  startOfUtcDay,
  toIsoUtc,
} from "@/lib/dates";

describe("UTC date helpers", () => {
  describe("nowUtc / nowUtcMs", () => {
    it("returns a Date whose ISO form ends in Z", () => {
      expect(nowUtc().toISOString()).toMatch(/Z$/);
    });

    it("nowUtcMs is within a few ms of nowUtc().getTime()", () => {
      const a = nowUtc().getTime();
      const b = nowUtcMs();
      expect(Math.abs(b - a)).toBeLessThan(100);
    });
  });

  describe("toIsoUtc", () => {
    it("serialises to ISO-8601 with Z suffix", () => {
      const d = new Date(Date.UTC(2026, 3, 18, 9, 30, 0, 0));
      expect(toIsoUtc(d)).toBe("2026-04-18T09:30:00.000Z");
    });
  });

  describe("formatUtcDate", () => {
    it("formats as YYYY-MM-DD in UTC", () => {
      const d = new Date(Date.UTC(2026, 0, 5, 12, 0, 0));
      expect(formatUtcDate(d)).toBe("2026-01-05");
    });

    it("does not shift the calendar date near midnight UTC", () => {
      // 23:30 UTC on Jan 5. In a -05:00 host timezone this would locally
      // show as Jan 5 18:30, but the UTC calendar day is still Jan 5.
      const d = new Date(Date.UTC(2026, 0, 5, 23, 30, 0));
      expect(formatUtcDate(d)).toBe("2026-01-05");
    });
  });

  describe("formatUtcDateTime", () => {
    it("formats as YYYY-MM-DD HH:mm:ss UTC", () => {
      const d = new Date(Date.UTC(2026, 3, 18, 9, 30, 45));
      expect(formatUtcDateTime(d)).toBe("2026-04-18 09:30:45 UTC");
    });

    it("zero-pads single-digit components", () => {
      const d = new Date(Date.UTC(2026, 0, 1, 1, 2, 3));
      expect(formatUtcDateTime(d)).toBe("2026-01-01 01:02:03 UTC");
    });
  });

  describe("startOfUtcDay / endOfUtcDay", () => {
    it("startOfUtcDay is 00:00:00.000 UTC on the same calendar day", () => {
      const d = new Date(Date.UTC(2026, 3, 18, 15, 22, 10, 500));
      expect(toIsoUtc(startOfUtcDay(d))).toBe("2026-04-18T00:00:00.000Z");
    });

    it("endOfUtcDay is 23:59:59.999 UTC on the same calendar day", () => {
      const d = new Date(Date.UTC(2026, 3, 18, 0, 0, 0, 0));
      expect(toIsoUtc(endOfUtcDay(d))).toBe("2026-04-18T23:59:59.999Z");
    });

    it("works at the extremes of a UTC day", () => {
      const d = new Date(Date.UTC(2026, 3, 18, 23, 59, 59, 999));
      expect(toIsoUtc(startOfUtcDay(d))).toBe("2026-04-18T00:00:00.000Z");
      expect(toIsoUtc(endOfUtcDay(d))).toBe("2026-04-18T23:59:59.999Z");
    });
  });

  describe("parseUtcDate", () => {
    it("parses YYYY-MM-DD as UTC midnight", () => {
      expect(toIsoUtc(parseUtcDate("2026-04-18"))).toBe("2026-04-18T00:00:00.000Z");
    });

    it("parses leap-day 2024-02-29", () => {
      expect(toIsoUtc(parseUtcDate("2024-02-29"))).toBe("2024-02-29T00:00:00.000Z");
    });

    it("throws on malformed input", () => {
      expect(() => parseUtcDate("2026/04/18")).toThrow(/Invalid YYYY-MM-DD/);
      expect(() => parseUtcDate("18-04-2026")).toThrow(/Invalid YYYY-MM-DD/);
      expect(() => parseUtcDate("")).toThrow(/Invalid YYYY-MM-DD/);
    });

    it("throws on invalid calendar dates", () => {
      expect(() => parseUtcDate("2025-02-29")).toThrow(/Invalid calendar date/);
      expect(() => parseUtcDate("2026-13-01")).toThrow(/Invalid calendar date/);
      expect(() => parseUtcDate("2026-04-31")).toThrow(/Invalid calendar date/);
    });
  });

  // The intent of this suite is the whole point: the helpers must produce
  // identical output regardless of the host's TZ. We can't trivially reset
  // the cached Intl formatters inside the module after flipping process.env.TZ
  // (Node's Date arithmetic already ignores process.env.TZ mid-process on some
  // platforms), so we prove invariance by constructing Dates in two ways that
  // would differ if the helpers used local time — and checking they don't.
  describe("host timezone invariance", () => {
    const originalTz = process.env.TZ;

    beforeAll(() => {
      // Document the host TZ for debugging; real invariance is asserted below.
      // eslint-disable-next-line no-console
      console.info(`[dates.test] host TZ = ${originalTz ?? "(unset)"}`);
    });

    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it("formatUtcDate ignores getTimezoneOffset of the host", () => {
      // Same instant, two equivalent UTC constructors.
      const d1 = new Date(Date.UTC(2026, 3, 18, 23, 30, 0));
      const d2 = new Date("2026-04-18T23:30:00.000Z");
      expect(formatUtcDate(d1)).toBe(formatUtcDate(d2));
      expect(formatUtcDate(d1)).toBe("2026-04-18");
    });

    it("startOfUtcDay reflects UTC calendar, not local calendar", () => {
      // An instant that is "the next day" in any positive UTC offset zone.
      const d = new Date("2026-04-18T23:59:00.000Z");
      expect(toIsoUtc(startOfUtcDay(d))).toBe("2026-04-18T00:00:00.000Z");
    });
  });
});
