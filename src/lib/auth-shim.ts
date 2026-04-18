/**
 * Temporary actor resolver — TODO(auth) replace when BetterAuth lands.
 *
 * The Entities & Jurisdictions feature ships before the auth/IAM
 * milestone (see TODO.md "Auth & IAM" section). Server actions need
 * an actor id to attribute audit_log rows to, but there's no real
 * session yet. This shim returns the bootstrap admin user (created
 * by the seed script) so the audit chain isn't broken.
 *
 * When BetterAuth integrates, swap the body of `getCurrentActor` for
 * the real session lookup. Call sites — server actions, the audit
 * helper — never change.
 */
import { eq } from "drizzle-orm";

import { type Db } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";

import type { ActorKind } from "./domain-types";

export interface CurrentActor {
  userId: string;
  kind: ActorKind;
}

let cachedAdminId: string | null = null;

export async function getCurrentActor(db: Db): Promise<CurrentActor> {
  if (!cachedAdminId) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, env.SEED_ADMIN_EMAIL))
      .limit(1);

    if (!row) {
      throw new Error(
        `auth-shim: no user found for SEED_ADMIN_EMAIL=${env.SEED_ADMIN_EMAIL}. ` +
          `Run \`pnpm db:seed\` first.`,
      );
    }
    cachedAdminId = row.id;
  }
  return { userId: cachedAdminId, kind: "user" };
}

