import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";

import type { ActorKind, ThingType } from "./domain-types";

export interface RecordAuditInput {
  /** Null when the system acts on its own (cron, recalc worker, seed). */
  actorId: string | null;
  actorKind: ActorKind;
  /** Set when an agent executed the action on behalf of the user. */
  agentId?: string | null;
  /**
   * Loose verb-noun string. Examples: `entity.created`, `period.locked`,
   * `jurisdiction.updated`. Free-form by design — `audit_log.action` is
   * not enum-typed.
   */
  action: string;
  /**
   * Only set for actions on a versioned Thing whose type appears in the
   * `thing_type` enum (invoice, expense, vat_declaration, …). Entity /
   * jurisdiction / person actions leave this null because those tables
   * aren't versioned in v0.1.
   */
  thingType?: ThingType | null;
  thingId?: string | null;
  /** Whatever context will help debugging later. Defaults to `{}`. */
  payload?: Record<string, unknown>;
}

/**
 * Single chokepoint for `audit_log` writes. Every mutation in a domain
 * service should call this exactly once after the business write
 * succeeds (same transaction when the DB instance is a transaction).
 */
export async function recordAudit(db: Db, input: RecordAuditInput): Promise<void> {
  await db.insert(auditLog).values({
    actorId: input.actorId,
    actorKind: input.actorKind,
    agentId: input.agentId ?? null,
    action: input.action,
    thingType: input.thingType ?? null,
    thingId: input.thingId ?? null,
    payload: input.payload ?? {},
  });
}
