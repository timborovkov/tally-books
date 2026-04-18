import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { clientEnv } from "@/lib/env.client";

describe("env", () => {
  it("parses NODE_ENV into one of the allowed values", () => {
    expect(["development", "test", "production"]).toContain(env.NODE_ENV);
  });

  it("is the same object on repeated imports (parsed once)", async () => {
    const again = await import("@/lib/env");
    expect(again.env).toBe(env);
  });

  it("applies the server Sentry sampling defaults when unset", () => {
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(env.SENTRY_PROFILES_SAMPLE_RATE).toBe(0.1);
  });

  it("leaves optional Sentry build-time vars undefined when unset", () => {
    expect(env.SENTRY_ORG).toBeUndefined();
    expect(env.SENTRY_PROJECT).toBeUndefined();
    expect(env.SENTRY_AUTH_TOKEN).toBeUndefined();
    expect(env.SENTRY_URL).toBeUndefined();
    expect(env.SENTRY_ENVIRONMENT).toBeUndefined();
  });
});

describe("clientEnv", () => {
  it("defaults NEXT_PUBLIC_SENTRY_ENABLED to false when unset", () => {
    // vitest.setup.ts doesn't set the toggle — the SDK must stay inert.
    expect(clientEnv.NEXT_PUBLIC_SENTRY_ENABLED).toBe(false);
  });

  it("leaves NEXT_PUBLIC_SENTRY_DSN undefined when unset (disabled)", () => {
    expect(clientEnv.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it("applies the client sampling defaults when unset", () => {
    expect(clientEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE).toBe(0.15);
    expect(clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE).toBe(0.1);
    expect(clientEnv.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE).toBe(1.0);
  });
});
