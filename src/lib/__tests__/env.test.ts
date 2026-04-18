import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";

describe("env", () => {
  it("parses NODE_ENV into one of the allowed values", () => {
    expect(["development", "test", "production"]).toContain(env.NODE_ENV);
  });

  it("is the same object on repeated imports (parsed once)", async () => {
    const again = await import("@/lib/env");
    expect(again.env).toBe(env);
  });

  it("treats an absent SENTRY_DSN as disabled (undefined)", () => {
    // vitest.setup.ts does not set SENTRY_DSN, so it must parse to undefined.
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});
