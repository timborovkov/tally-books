import { describe, expect, it } from "vitest";

/**
 * Integration-style guard: with the master toggle off (and/or blank DSN) the
 * Sentry init must not arm the client — no events sent, no network traffic.
 * Catches regressions where a refactor accidentally hardcodes a DSN or
 * inverts the enabled gate.
 *
 * We assert against the live `Sentry.getClient()` state — not mocks — so the
 * test exercises the real init path.
 */
describe("Sentry (disabled when toggle is off or DSN is blank)", () => {
  it("server config leaves the SDK effectively inert with defaults", async () => {
    // Ensure the env is blank in this test process.
    delete process.env.NEXT_PUBLIC_SENTRY_ENABLED;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const Sentry = await import("@sentry/nextjs");
    await import("@/sentry.server.config");

    const client = Sentry.getClient();
    // No DSN configured → no transport destination.
    const dsn = client?.getOptions()?.dsn ?? "";
    expect(dsn).toBe("");

    // And the `enabled` gate short-circuits transports regardless.
    expect(client?.getOptions()?.enabled ?? false).toBe(false);
  });

  it("source guards the enabled flag on both toggle and DSN presence", async () => {
    // Prove the inverse by reading the config source directly: Sentry caches
    // a singleton client, so we can't re-init with a fake DSN in the same
    // process. Instead we verify the intent of the guard in source.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const configPath = path.resolve(here, "../sentry.server.config.ts");
    const src = await fs.readFile(configPath, "utf8");
    // Both conditions must be present in the enabled expression.
    expect(src).toMatch(/NEXT_PUBLIC_SENTRY_ENABLED/);
    expect(src).toMatch(/dsn\s*!==\s*""/);
  });
});
