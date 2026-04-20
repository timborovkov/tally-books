import { describe, expect, it } from "vitest";

import { intakeOcrPayload, PAYLOAD_SCHEMAS, QUEUES } from "@/lib/jobs/queues";

describe("jobs/queues", () => {
  it("exposes every queue through PAYLOAD_SCHEMAS", () => {
    for (const q of Object.values(QUEUES)) {
      expect(PAYLOAD_SCHEMAS[q]).toBeDefined();
    }
  });

  it("rejects an intake.ocr payload missing intakeItemId", () => {
    expect(() => intakeOcrPayload.parse({})).toThrow();
  });

  it("accepts a valid intake.ocr payload", () => {
    const parsed = intakeOcrPayload.parse({ intakeItemId: "int_123" });
    expect(parsed.intakeItemId).toBe("int_123");
  });

  it("strips unknown fields (zod default behaviour) without throwing", () => {
    const parsed = intakeOcrPayload.parse({ intakeItemId: "int_123", extra: "ignored" });
    expect(parsed).toEqual({ intakeItemId: "int_123" });
  });
});
