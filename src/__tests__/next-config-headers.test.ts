import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

/**
 * Guards the security / SEO headers against accidental removal. Sentry's
 * `withSentryConfig` wrapper must preserve the `headers()` function — if a
 * future refactor inlines a different config shape and loses these headers,
 * this test fails before the build ships.
 */
describe("next.config headers()", () => {
  it("exports a callable async headers() function", () => {
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("emits X-Robots-Tag: noindex, nofollow for all paths", async () => {
    const headers = nextConfig.headers ? await nextConfig.headers() : [];
    expect(headers.length).toBeGreaterThan(0);

    const wildcard = headers.find((h) => h.source === "/:path*");
    expect(wildcard).toBeDefined();

    const byKey = Object.fromEntries((wildcard?.headers ?? []).map((h) => [h.key, h.value]));
    expect(byKey["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
