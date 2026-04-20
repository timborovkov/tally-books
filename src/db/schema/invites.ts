import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { users } from "./users";

// docs/data-model.md §4.3.
export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    email: text("email").notNull(),
    // Snapshot of permissions chosen at invite time. Not kept in sync after acceptance.
    scope: jsonb("scope").notNull(),
    // SHA-256 of the invite token. We never store raw tokens at rest.
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => users.id),
  },
  (t) => [index("invites_email_accepted_idx").on(t.email, t.acceptedAt)],
);

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
