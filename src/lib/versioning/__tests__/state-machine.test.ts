import { describe, expect, it } from "vitest";

import { InvalidStateTransitionError } from "@/lib/versioning/errors";
import {
  assertTransition,
  canTransition,
  TERMINAL_STATES,
} from "@/lib/versioning/state-machine";

describe("state-machine — base transitions", () => {
  it("allows draft → ready", () => {
    expect(canTransition("draft", "ready", { thingType: "receipt" })).toBe(true);
  });

  it("allows draft → void", () => {
    expect(canTransition("draft", "void", { thingType: "receipt" })).toBe(true);
  });

  it("allows ready → filed", () => {
    expect(canTransition("ready", "filed", { thingType: "receipt" })).toBe(true);
  });

  it("allows ready → draft (kick back)", () => {
    expect(canTransition("ready", "draft", { thingType: "receipt" })).toBe(true);
  });

  it("allows filed → amending", () => {
    expect(canTransition("filed", "amending", { thingType: "receipt" })).toBe(true);
  });

  it("allows amending → filed", () => {
    expect(canTransition("amending", "filed", { thingType: "receipt" })).toBe(true);
  });

  it("rejects draft → filed (must go through ready)", () => {
    expect(canTransition("draft", "filed", { thingType: "receipt" })).toBe(false);
  });

  it("rejects void → anything", () => {
    for (const next of ["draft", "ready", "filed", "amending", "sent"] as const) {
      expect(canTransition("void", next, { thingType: "receipt" })).toBe(false);
    }
  });

  it("rejects filed → ready (must amend first)", () => {
    expect(canTransition("filed", "ready", { thingType: "receipt" })).toBe(false);
  });

  it("rejects same-state self-transition", () => {
    expect(canTransition("draft", "draft", { thingType: "receipt" })).toBe(false);
  });

  it("base receipt path does not include sent", () => {
    expect(canTransition("ready", "sent", { thingType: "receipt" })).toBe(false);
  });
});

describe("state-machine — invoice overrides", () => {
  it("invoice adds ready → sent", () => {
    expect(canTransition("ready", "sent", { thingType: "invoice" })).toBe(true);
  });

  it("invoice allows sent → filed", () => {
    expect(canTransition("sent", "filed", { thingType: "invoice" })).toBe(true);
  });

  it("invoice allows sent → void", () => {
    expect(canTransition("sent", "void", { thingType: "invoice" })).toBe(true);
  });

  it("invoice still allows ready → filed (override is additive)", () => {
    expect(canTransition("ready", "filed", { thingType: "invoice" })).toBe(true);
  });
});

describe("state-machine — assertTransition", () => {
  it("throws InvalidStateTransitionError on illegal transitions", () => {
    expect(() => assertTransition("draft", "filed", { thingType: "receipt" })).toThrow(
      InvalidStateTransitionError,
    );
  });

  it("does not throw on legal transitions", () => {
    expect(() => assertTransition("draft", "ready", { thingType: "receipt" })).not.toThrow();
  });

  it("error payload carries from/to/thingType", () => {
    try {
      assertTransition("draft", "filed", { thingType: "receipt" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidStateTransitionError);
      const e = err as InvalidStateTransitionError;
      expect(e.meta).toMatchObject({ from: "draft", to: "filed", thingType: "receipt" });
    }
  });
});

describe("state-machine — terminal states", () => {
  it("lists void as terminal", () => {
    expect(TERMINAL_STATES).toContain("void");
  });
});
