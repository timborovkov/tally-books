import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { userRoleEnum } from "./enums";

// data-structure.md §4.1.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    email: text("email").notNull().unique(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("member"),
    twoFactorSecret: text("two_factor_secret"),
    twoFactorEnabledAt: timestamp("two_factor_enabled_at", { withTimezone: true }),
    bootstrapCompletedAt: timestamp("bootstrap_completed_at", { withTimezone: true }),
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
