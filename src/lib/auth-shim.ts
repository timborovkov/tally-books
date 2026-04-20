// Resolver for the authenticated actor attributed to audit_log writes and
// edit-session ownership. Reads the real BetterAuth session via
// getCurrentUser(); throws when no session is present so server actions
// can't silently attribute a mutation to nobody.
//
// The `db` parameter is kept for call-site compatibility and to keep the
// door open for a future per-tx actor resolver (e.g. impersonation
// inside a transaction). It's unused today.
import { type Db } from "@/db/client";
import type { User } from "@/db/schema";
import { getCurrentUser } from "@/lib/iam/session";

import type { ActorKind } from "./domain-types";

/**
 * The actor attribution every domain mutation receives. Carries the
 * fields `audit_log` needs (userId, kind) **and** the fields `assertCan`
 * needs (role, removedAt) so mutations can enforce IAM without making a
 * second query. Agent origination is represented via `kind='user'` with
 * `agentId` set on the version row — see data-structure.md §2.2.
 */
export interface CurrentActor {
  userId: string;
  kind: ActorKind;
  /** Narrow User projection with the fields `assertCan` reads. */
  user: Pick<User, "id" | "role" | "removedAt">;
}

export async function getCurrentActor(_db: Db): Promise<CurrentActor> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "getCurrentActor: no authenticated session. Server actions in (app) must run behind the auth gate.",
    );
  }
  return {
    userId: user.id,
    kind: "user",
    user: { id: user.id, role: user.role, removedAt: user.removedAt },
  };
}
