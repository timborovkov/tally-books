import { describe, expect, it } from "vitest";

/**
 * Integration-style guard: with empty DSNs the Sentry init must not arm the
 * client (no events sent, no network traffic). This catches regressions where
 * a refactor accidentally hardcodes a DSN or inverts the enabled check.
 *
 * We assert against the live `Sentry.getClient()` state — not mocks — so the
 * test exercises the real init path.
 */
describe("Sentry (disabled when DSN is empty)", () => {
  it("server config leaves the SDK effectively inert with blank DSN", async () => {
    // Ensure the env is blank in this test process.
    delete process.env.SENTRY_DSN;

    // Import after mutating env so sentry.server.config reads the blank value.
    // Using a cache-busting query like ?v= won't work for TS modules, so we
    // reach into the Sentry global client after calling init.
    const Sentry = await import("@sentry/nextjs");
    await import("@/sentry.server.config");

    const client = Sentry.getClient();
    // The SDK may or may not register a client depending on the runtime; what
    // we care about is that no DSN is configured — a proxy for "no events".
    const dsn = client?.getOptions()?.dsn ?? "";
    expect(dsn).toBe("");

    // And the explicit `enabled: false` branch short-circuits transports.
    expect(client?.getOptions()?.enabled ?? false).toBe(false);
  });

  it("populated DSN would arm the client (sanity check the guard is meaningful)", async () => {
    // Prove the inverse: if a DSN *were* set, enabled would be true.
    // We don't actually initialize Sentry with a real DSN in tests — Sentry
    // caches a singleton client, so we verify the guard's intent by reading
    // the config module's source directly.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const configPath = path.resolve(here, "../sentry.server.config.ts");
    const src = await fs.readFile(configPath, "utf8");
    expect(src).toMatch(/enabled:\s*dsn\s*!==\s*""/);
  });
});
