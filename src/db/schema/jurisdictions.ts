import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { newId } from "@/db/id";

// data-structure.md §5.1. Jurisdiction is a country-level config bundle
// (entity types, VAT rules, filing schedules, portal/guide links, ...).
// `config` is jsonb in the database; the application boundary parses it
// against the JurisdictionConfig Zod schema in src/lib/jurisdictions/types.ts.
export const jurisdictions = pgTable("jurisdictions", {
  id: text("id").primaryKey().$defaultFn(newId),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  config: jsonb("config")
    .notNull()
    .default(sql`'{}'::jsonb`),
  freeformContextMd: text("freeform_context_md"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;
