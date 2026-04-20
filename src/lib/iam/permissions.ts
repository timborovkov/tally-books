import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/db/client";
import type { User } from "@/db/schema";
import { permissions } from "@/db/schema";

import type { AccessLevel, ResourceType } from "./types";

export class PermissionDeniedError extends Error {
  constructor(
    public resourceType: ResourceType,
    public access: AccessLevel,
  ) {
    super(`Permission denied: ${access} on ${resourceType}`);
    this.name = "PermissionDeniedError";
  }
}

type ScopeObject = Record<string, unknown>;

/**
 * Scope-match semantics (intentional, matches AWS IAM's condition model):
 *
 *   - **Empty grant** `{}` is a wildcard — allows any request.
 *   - **Non-empty grant + no request scope** → deny (caller must declare
 *     the resource's scope when the grant is scoped).
 *   - **Non-empty grant + request scope:** every key in the GRANT must
 *     exist in the request with the same value. Keys in the request that
 *     the grant does not mention are ignored — they describe attributes
 *     of the specific resource being accessed that the grant does not
 *     restrict on.
 *
 * Worked example: grant `{ entityId: "ent_1" }`, request
 * `{ entityId: "ent_1", fyYear: "FY2024" }` → allow. The admin restricted
 * the grant to entity `ent_1` only; they did NOT scope by financial year,
 * so any year for that entity is in scope. If they wanted per-year
 * restriction, they would add `fyYear` to the grant.
 *
 * This means scoped grants act as a wildcard on dimensions the admin did
 * not mention. That's the desired behavior — the alternative (require
 * every request key to be covered by the grant) forces admins to enumerate
 * every dimension of every resource upfront, which doesn't scale and makes
 * adding new dimensions a breaking change for existing grants.
 */
function scopeMatches(granted: unknown, required: ScopeObject | undefined): boolean {
  const g = (granted ?? {}) as ScopeObject;
  if (Object.keys(g).length === 0) return true; // wildcard
  if (!required) return false; // caller didn't supply scope, but grant is scoped
  for (const [k, v] of Object.entries(g)) {
    if (required[k] !== v) return false;
  }
  return true;
}

// `write` implies `read`. An explicit write grant also satisfies a read
// request against the same (user, resourceType, scope).
function levelSatisfies(granted: AccessLevel, requested: AccessLevel): boolean {
  if (granted === requested) return true;
  return granted === "write" && requested === "read";
}

/**
 * `db` is the caller's Drizzle handle — the root client for non-
 * transactional checks (pages, API handlers) or the current `tx`
 * handle when invoked inside `db.transaction(async (tx) => ...)`.
 *
 * Taking `db` as an argument (rather than importing a module-level
 * singleton) is load-bearing: when a mutation holds a `SELECT ... FOR
 * UPDATE` inside a transaction, its authz check needs to read the
 * same snapshot. Querying a separate connection would miss uncommitted
 * state from earlier in the tx and skip the row lock's serialisation.
 */
export async function can(
  db: Db,
  user: Pick<User, "id" | "role" | "removedAt">,
  resourceType: ResourceType,
  access: AccessLevel,
  scope?: ScopeObject,
): Promise<boolean> {
  if (user.removedAt) return false;
  if (user.role === "admin") return true;

  const rows = await db
    .select({
      access: permissions.access,
      resourceScope: permissions.resourceScope,
    })
    .from(permissions)
    .where(
      and(
        eq(permissions.userId, user.id),
        eq(permissions.resourceType, resourceType),
        isNull(permissions.revokedAt),
      ),
    );

  return rows.some((p) => levelSatisfies(p.access, access) && scopeMatches(p.resourceScope, scope));
}

export async function assertCan(
  db: Db,
  user: Pick<User, "id" | "role" | "removedAt">,
  resourceType: ResourceType,
  access: AccessLevel,
  scope?: ScopeObject,
): Promise<void> {
  const ok = await can(db, user, resourceType, access, scope);
  if (!ok) throw new PermissionDeniedError(resourceType, access);
}
