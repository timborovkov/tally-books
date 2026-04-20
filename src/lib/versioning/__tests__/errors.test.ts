import { describe, expect, it } from "vitest";

import { DomainError } from "@/domains/errors";
import {
  InvalidStateTransitionError,
  PeriodLockedError,
  VersionConflictError,
} from "@/lib/versioning/errors";

describe("InvalidStateTransitionError", () => {
  it("carries code, name, message, from/to/thingType", () => {
    const err = new InvalidStateTransitionError("draft", "filed", "receipt");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe("InvalidStateTransitionError");
    expect(err.code).toBe("invalid_state_transition");
    expect(err.message).toMatch(/Invalid receipt state transition: draft → filed/);
    expect(err.meta).toEqual({ from: "draft", to: "filed", thingType: "receipt" });
  });
});

describe("PeriodLockedError", () => {
  it("carries code + full meta payload", () => {
    const occurredAt = new Date("2025-06-15T00:00:00Z");
    const lockedAt = new Date("2025-07-01T00:00:00Z");
    const err = new PeriodLockedError({
      periodId: "p_1",
      entityId: "e_1",
      occurredAt,
      lockedAt,
      lockReason: "filed with EMTA",
    });
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe("PeriodLockedError");
    expect(err.code).toBe("period_locked");
    expect(err.message).toMatch(/locked financial period/i);
    expect(err.meta).toEqual({
      periodId: "p_1",
      entityId: "e_1",
      occurredAt,
      lockedAt,
      lockReason: "filed with EMTA",
    });
  });

  it("accepts nullable lockedAt / lockReason", () => {
    const err = new PeriodLockedError({
      periodId: "p_1",
      entityId: "e_1",
      occurredAt: new Date(),
      lockedAt: null,
      lockReason: null,
    });
    expect(err.meta).toMatchObject({ lockedAt: null, lockReason: null });
  });
});

describe("VersionConflictError", () => {
  it("formats message with expected vs actual version and exposes meta", () => {
    const err = new VersionConflictError("receipt", "rcp_1", 2, 3);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe("VersionConflictError");
    expect(err.code).toBe("version_conflict");
    expect(err.message).toMatch(/expected version 2, found 3/);
    expect(err.meta).toEqual({ thingType: "receipt", id: "rcp_1", expected: 2, actual: 3 });
  });
});
