/**
 * Shared TypeScript aliases for enum values used across domain code.
 *
 * These derive directly from Drizzle's `pgEnum` tuple types in
 * `src/db/schema/enums.ts`. `pgEnum` preserves its values as a literal
 * tuple in its type, so `(typeof x.enumValues)[number]` gives the
 * narrow string-literal union we want — any ALTER TYPE or new enum
 * value shows up in the TS type automatically with no hand-maintained
 * mirror to drift.
 */
import type { actorKindEnum, thingTypeEnum } from "@/db/schema/enums";

export type ActorKind = (typeof actorKindEnum.enumValues)[number];

export type ThingType = (typeof thingTypeEnum.enumValues)[number];
