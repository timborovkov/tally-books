import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { userRoleEnum } from "./enums";

// docs/data-model.md §4.1.
//
// BetterAuth also writes here. The extra columns below (emailVerified,
// image, twoFactorEnabled, banned/banReason/banExpires, updatedAt) are
// what the BetterAuth core + twoFactor + admin plugins require on the
// user table. Our spec columns (role, twoFactorEnabledAt, bootstrapCompletedAt,
// removedAt) stay — they're what the app reads for IAM + gating, while
// BetterAuth's own fields are implementation detail.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    email: text("email").notNull().unique(),
    name: text("name"),

    // BetterAuth core — required by the core user schema.
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),

    role: userRoleEnum("role").notNull().default("member"),

    // Kept per docs/data-model.md §4.1. BetterAuth's twoFactor plugin stores
    // the live TOTP secret in the `two_factors` table (see src/db/schema/two-factors.ts)
    // — this column is reserved by the spec and currently not written to
    // by our code. If we ever take the secret back from the plugin, this
    // is where it lands.
    twoFactorSecret: text("two_factor_secret"),

    // BetterAuth twoFactor plugin — ground-truth flag lives on the user
    // row. Our `two_factor_enabled_at` below is the CHECK-constraint gate.
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),

    // Our own timestamps — set when 2FA enrollment completes and when
    // the user finishes bootstrap. The CHECK below uses them.
    twoFactorEnabledAt: timestamp("two_factor_enabled_at", { withTimezone: true }),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", { withTimezone: true }),

    // BetterAuth admin plugin — soft-ban state. We wire our `removedAt`
    // to set `banned = true` so BetterAuth rejects sessions for removed
    // users without needing to fork the plugin.
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),

    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every active, non-bootstrap user has 2FA. The one exception is the
    // very first admin mid-setup (bootstrap_completed_at IS NULL).
    check(
      "users_2fa_required",
      sql`${t.twoFactorEnabledAt} IS NOT NULL OR ${t.removedAt} IS NOT NULL OR ${t.bootstrapCompletedAt} IS NULL`,
    ),
    index("users_active_idx")
      .on(t.removedAt)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
