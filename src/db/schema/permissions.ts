import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { accessLevelEnum, resourceTypeEnum } from "./enums";
import { users } from "./users";

// docs/data-model.md §4.4.
export const permissions = pgTable(
  "permissions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    // e.g. `{ entityId: 'oue_123' }`. Service layer evaluates.
    resourceScope: jsonb("resource_scope")
      .notNull()
      .default(sql`'{}'::jsonb`),
    access: accessLevelEnum("access").notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => users.id),
  },
  (t) => [
    index("permissions_active_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
