import { DomainError } from "@/domains/errors";

import type { ThingState } from "./types";

/**
 * Requested state transition is not in the allowed set for the thing
 * type. Thrown by `assertTransition` in `state-machine.ts`.
 */
export class InvalidStateTransitionError extends DomainError {
  constructor(from: ThingState, to: ThingState, thingType: string) {
    super(
      "invalid_state_transition",
      `Invalid ${thingType} state transition: ${from} → ${to}`,
      { from, to, thingType },
    );
    this.name = "InvalidStateTransitionError";
  }
}

/**
 * Mutation targets a Thing that falls inside a locked financial period.
 * Thrown by `assertPeriodUnlocked`.
 */
export class PeriodLockedError extends DomainError {
  constructor(meta: {
    periodId: string;
    entityId: string;
    occurredAt: Date;
    lockedAt: Date | null;
    lockReason: string | null;
  }) {
    super(
      "period_locked",
      `This change falls inside a locked financial period. Unlock the period first.`,
      meta,
    );
    this.name = "PeriodLockedError";
  }
}

/**
 * Optimistic concurrency miss: caller passed `expectedVersionNum` and
 * the row moved since they read it.
 */
export class VersionConflictError extends DomainError {
  constructor(thingType: string, id: string, expected: number, actual: number) {
    super(
      "version_conflict",
      `${thingType} ${id} was modified: expected version ${expected}, found ${actual}`,
      { thingType, id, expected, actual },
    );
    this.name = "VersionConflictError";
  }
}
