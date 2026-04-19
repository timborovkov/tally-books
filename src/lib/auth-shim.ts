// Resolver for the authenticated actor attributed to audit_log writes and
// edit-session ownership. Reads the real BetterAuth session via
// getCurrentUser(); throws when no session is present so server actions
// can't silently attribute a mutation to nobody.
//
// The `db` parameter is kept for call-site compatibility and to keep the
// door open for a future per-tx actor resolver (e.g. impersonation
// inside a transaction). It's unused today.
import { type Db } from "@/db/client";
import { getCurrentUser } from "@/lib/iam/session";

import type { ActorKind } from "./domain-types";

export interface CurrentActor {
  userId: string;
  kind: ActorKind;
}

export async function getCurrentActor(_db: Db): Promise<CurrentActor> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "getCurrentActor: no authenticated session. Server actions in (app) must run behind the auth gate.",
    );
  }
  return { userId: user.id, kind: "user" };
}
