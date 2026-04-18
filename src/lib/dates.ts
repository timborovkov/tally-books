/**
 * UTC-only date helpers.
 *
 * All times in Tally are stored and displayed in UTC — no host-timezone leaks,
 * ever. Feature code must use these helpers rather than `new Date()`,
 * `Date.now()`, or `toLocale*`. The ESLint `no-restricted-syntax` rule in
 * `eslint.config.mjs` bans those patterns outside this file and test files.
 *
 * See `docs/architecture/dates.md` for the rationale and convention.
 */

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const UTC_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Current instant, as a `Date`. Thin wrapper so every "now" call is greppable. */
export function nowUtc(): Date {
  return new Date();
}

/** Current instant in epoch milliseconds. Use in place of `Date.now()`. */
export function nowUtcMs(): number {
  return new Date().getTime();
}

/** Serialise a `Date` as an ISO-8601 UTC string (`Z` suffix). */
export function toIsoUtc(d: Date): string {
  return d.toISOString();
}

/** Format a `Date` as `YYYY-MM-DD` in UTC. */
export function formatUtcDate(d: Date): string {
  return UTC_DATE_FORMATTER.format(d);
}

/** Format a `Date` as `YYYY-MM-DD HH:mm:ss UTC`. */
export function formatUtcDateTime(d: Date): string {
  const parts = UTC_DATETIME_FORMATTER.formatToParts(d).reduce<Record<string, string>>(
    (acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    },
    {},
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} UTC`;
}

/** Midnight (00:00:00.000) of the same UTC calendar day as `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/** Last representable millisecond (23:59:59.999) of the same UTC calendar day as `d`. */
export function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Parse a `YYYY-MM-DD` string into a UTC-midnight `Date`.
 * Throws on malformed input — never silently coerces.
 */
export function parseUtcDate(s: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD date string: ${JSON.stringify(s)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${JSON.stringify(s)}`);
  }
  return d;
}
