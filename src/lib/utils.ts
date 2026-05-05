import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Escape SQL LIKE/ILIKE wildcards in user-supplied search input. Without
 * this, `%` matches everything and `_` matches any single char, so a
 * user typing "20%" or "foo_bar" gets unrelated rows back. Backslash-
 * escapes the three SQL LIKE specials (`\`, `%`, `_`); Postgres uses
 * backslash as the LIKE escape char by default — no `ESCAPE` clause
 * needed at the call site.
 *
 * Used by every list query that exposes a free-text filter.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}
