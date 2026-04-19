import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

// BetterAuth's "verification" table — short-lived challenge rows for
// email verification, 2FA cookies, password-reset tokens, etc. Managed
// entirely by BetterAuth; app code never reads/writes it directly.
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
