import type { ThingType } from "@/lib/domain-types";

import { InvalidStateTransitionError } from "./errors";
import type { ThingState } from "./types";

/**
 * Base state-machine every versioned Thing rides.
 *
 * `void` and `filed` are effectively terminal for the base transitions;
 * `filed → amending` is the only route out of `filed`. `amending` folds
 * back into `filed` when the amendment is accepted, and the UI surfaces
 * "amended" by observing that the thing has more than one `filed`
 * version in its history (data-structure.md §3.2). No separate
 * `amended` enum value — the word is a derived label, not a state.
 */
const BASE_TRANSITIONS: Record<ThingState, readonly ThingState[]> = {
  draft: ["ready", "void"],
  ready: ["draft", "filed", "void"],
  sent: [],
  filed: ["amending"],
  amending: ["filed", "void"],
  void: [],
};

/**
 * Per-thing overrides add (never remove) transitions. Invoices lifecycle
 * includes `sent` — the dispatched-to-client state that sits between
 * `ready` and `filed`. Other types keep the base set.
 */
const PER_TYPE_OVERRIDES: Partial<Record<ThingType, Partial<Record<ThingState, ThingState[]>>>> = {
  invoice: {
    ready: ["draft", "sent", "filed", "void"],
    sent: ["filed", "void"],
  },
};

function allowedNextStates(from: ThingState, thingType: ThingType): readonly ThingState[] {
  const override = PER_TYPE_OVERRIDES[thingType]?.[from];
  return override ?? BASE_TRANSITIONS[from];
}

export function canTransition(
  from: ThingState,
  to: ThingState,
  { thingType }: { thingType: ThingType },
): boolean {
  if (from === to) return false;
  return allowedNextStates(from, thingType).includes(to);
}

export function assertTransition(
  from: ThingState,
  to: ThingState,
  { thingType }: { thingType: ThingType },
): void {
  if (!canTransition(from, to, { thingType })) {
    throw new InvalidStateTransitionError(from, to, thingType);
  }
}

export const TERMINAL_STATES: readonly ThingState[] = ["void"];

/**
 * The full set of `thing_state` enum values, re-exported as a single
 * source of truth so action layers and UI selectors don't duplicate
 * the list. Derived from the Drizzle enum, so adding a value there
 * flows through automatically.
 */
export { thingStateEnum } from "@/db/schema/enums";

/**
 * Subset of states a receipt UI should offer as transition targets.
 * Excludes `sent` (invoice-only). `assertTransition` is still the
 * authoritative gate — this list is just for dropdown population.
 */
export const RECEIPT_TRANSITION_TARGETS: readonly ThingState[] = [
  "draft",
  "ready",
  "filed",
  "amending",
  "void",
];
