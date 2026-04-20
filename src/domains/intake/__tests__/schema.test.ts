import { describe, expect, it } from "vitest";

import { intakeRoutingInput, routeIntakeInput } from "@/domains/intake";

describe("intake/schema", () => {
  it("rejects business routing without an entityId", () => {
    expect(() =>
      intakeRoutingInput.parse({
        isPersonal: false,
        entityId: null,
        targetFlow: "expense",
      }),
    ).toThrow();
  });

  it("rejects personal routing with an entityId", () => {
    expect(() =>
      intakeRoutingInput.parse({
        isPersonal: true,
        entityId: "ent_1",
        targetFlow: "expense",
      }),
    ).toThrow();
  });

  it("accepts valid business routing", () => {
    const parsed = intakeRoutingInput.parse({
      isPersonal: false,
      entityId: "ent_1",
      targetFlow: "expense",
    });
    expect(parsed.targetFlow).toBe("expense");
  });

  it("accepts valid personal routing", () => {
    const parsed = intakeRoutingInput.parse({
      isPersonal: true,
      entityId: null,
      targetFlow: "expense",
    });
    expect(parsed.isPersonal).toBe(true);
  });

  it("routeIntakeInput requires the id field", () => {
    expect(() =>
      routeIntakeInput.parse({
        isPersonal: true,
        entityId: null,
        targetFlow: "expense",
      }),
    ).toThrow();
  });
});
