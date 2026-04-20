import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { users } from "./users";

// docs/data-model.md §4.2 — BetterAuth owns the shape; mirrored so Drizzle can join.
//
// BetterAuth's session schema adds `token` (unique session token) and
// `updatedAt`. The admin plugin adds `impersonatedBy`. Those columns
// below are BetterAuth-owned — don't write to them from app code.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_expires_idx").on(t.userId, t.expiresAt.desc())],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
