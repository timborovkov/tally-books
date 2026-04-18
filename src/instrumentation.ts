/**
 * Next.js calls `register` once per server process at startup.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Side-effect import of `@/lib/env` runs the zod validation immediately,
 * so a misconfigured deploy fails at boot instead of crashing on the
 * first request that touches a bad value.
 */
export async function register(): Promise<void> {
  await import("@/lib/env");
}
