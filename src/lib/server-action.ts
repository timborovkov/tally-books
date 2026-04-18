// Shared shape for server-action results across the auth and IAM surfaces.
// Keep this module tiny and dependency-free so any "use server" file can
// import it without pulling in DB or other server-only code.
//
// Typed as a discriminated union on `ok` so callers get narrowed types:
// after `if (res.ok)` TypeScript knows `res.data` is present (when T is
// non-void) and `res.error` is unavailable; after `else` it knows
// `res.error` is the string.
export type ActionResult<T = void> =
  | (T extends void ? { ok: true; data?: undefined } : { ok: true; data: T })
  | { ok: false; error: string };
