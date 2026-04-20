import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

import { users } from "./users";

// docs/data-model.md §5.3. A `person` is a real human — the user themself,
// a co-founder, an employee, a contractor, an external counterparty.
// `user_id` is set when the person is also a platform user.
export const persons = pgTable("persons", {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  legalName: text("legal_name").notNull(),
  // Jurisdiction code (e.g. "EE", "FI"). Not an FK — jurisdictions can be
  // archived or renamed; tax residency is a snapshot of where the person
  // pays tax today, and historical accuracy matters more than referential
  // integrity here.
  taxResidency: text("tax_residency"),
  ids: jsonb("ids")
    .notNull()
    .default(sql`'{}'::jsonb`),
  addresses: jsonb("addresses")
    .notNull()
    .default(sql`'[]'::jsonb`),
  contact: jsonb("contact")
    .notNull()
    .default(sql`'{}'::jsonb`),
  metadata: jsonb("metadata")
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
