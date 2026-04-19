import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { users } from "./users";

// BetterAuth twoFactor plugin table — stores the TOTP secret and a
// serialized list of backup codes per user. Written only via the
// plugin's endpoints.
//
// Security: `verified` defaults to false. BetterAuth's `enable` endpoint
// explicitly writes the correct value on INSERT (false for a fresh factor,
// true only when skipVerificationOnEnable is set or the caller is
// re-enabling an already-verified factor) — so the default is only
// observed if someone bypasses the plugin and writes a row directly
// (manual SQL, custom migration, external tool). In that case the safe
// answer is "unverified", because our `markTwoFactorEnabledAction` gates
// on `verified = true` as its trust signal. A default of `true` would
// fail open if the plugin contract ever changed.
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [index("two_factors_user_idx").on(t.userId)],
);

export type TwoFactor = typeof twoFactors.$inferSelect;
export type NewTwoFactor = typeof twoFactors.$inferInsert;
