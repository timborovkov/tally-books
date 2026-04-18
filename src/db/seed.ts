/**
 * CLI: seed dev data.
 *
 * Run with `pnpm db:seed`. Idempotent — uses ON CONFLICT DO NOTHING
 * and metadata markers to detect rows the seed already created.
 */
/* eslint-disable no-console -- CLI script: stdout is the user-facing surface. */
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { prefilledJurisdictions } from "@/lib/jurisdictions";

type SeedDb = PostgresJsDatabase<typeof schema>;

export interface SeedReport {
  adminCreated: boolean;
  jurisdictionsCreated: number;
  personalEntityCreated: boolean;
}

/**
 * Apply seed data. Exposed (not just in `main`) so integration tests
 * can run it against an ephemeral DB and assert idempotency.
 */
export async function seed(db: SeedDb): Promise<SeedReport> {
  const adminEmail = env.SEED_ADMIN_EMAIL;

  // bootstrap_completed_at = NULL satisfies the 2FA CHECK during seeding;
  // the real bootstrap wizard sets it once the admin enables 2FA.
  const adminInsert = await db
    .insert(schema.users)
    .values({
      id: newId(),
      email: adminEmail,
      name: "Bootstrap admin",
      role: "admin",
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id });

  const adminCreated = adminInsert.length > 0;

  const [adminRow] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .limit(1);

  if (!adminRow) {
    throw new Error(`Seed: admin user ${adminEmail} not found after upsert`);
  }

  // Jurisdictions: upsert by `code`. Conflict path leaves existing
  // configs alone so a self-hoster who customised them isn't clobbered.
  let jurisdictionsCreated = 0;
  for (const j of prefilledJurisdictions) {
    const inserted = await db
      .insert(schema.jurisdictions)
      .values({
        id: newId(),
        code: j.code,
        name: j.name,
        config: j.config,
        freeformContextMd: j.freeformContextMd,
      })
      .onConflictDoNothing({ target: schema.jurisdictions.code })
      .returning({ id: schema.jurisdictions.id });
    if (inserted.length > 0) jurisdictionsCreated += 1;
  }

  // Bootstrap personal pseudo-entity for the admin, anchored to Estonia
  // by default (the author's residency; overridable via the UI). The
  // metadata marker keeps the seed idempotent without a unique index.
  const [estonia] = await db
    .select({ id: schema.jurisdictions.id })
    .from(schema.jurisdictions)
    .where(eq(schema.jurisdictions.code, "EE"))
    .limit(1);

  let personalEntityCreated = false;
  if (estonia) {
    const [existing] = await db
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(
        and(
          eq(schema.entities.kind, "personal"),
          sql`${schema.entities.metadata} ->> 'seed' = 'bootstrap_personal'`,
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(schema.entities).values({
        id: newId(),
        kind: "personal",
        name: "Personal",
        jurisdictionId: estonia.id,
        baseCurrency: "EUR",
        financialYearStartMonth: 1,
        metadata: { seed: "bootstrap_personal", bootstrappedFor: adminRow.id },
      });
      personalEntityCreated = true;
    }
  }

  return { adminCreated, jurisdictionsCreated, personalEntityCreated };
}

async function main(): Promise<void> {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const report = await seed(db);
    console.log(
      report.adminCreated
        ? `Seeded admin user: ${env.SEED_ADMIN_EMAIL}`
        : `Admin user ${env.SEED_ADMIN_EMAIL} already exists — skipped.`,
    );
    console.log(
      report.jurisdictionsCreated > 0
        ? `Seeded ${report.jurisdictionsCreated} jurisdiction(s).`
        : `Jurisdictions already present — skipped.`,
    );
    console.log(
      report.personalEntityCreated
        ? `Seeded personal pseudo-entity for ${env.SEED_ADMIN_EMAIL}.`
        : `Personal pseudo-entity already exists — skipped.`,
    );
  } finally {
    await client.end();
  }
}

// Only run main() when executed directly, not when imported by tests.
const isDirectInvocation = typeof process !== "undefined" && process.argv[1]?.endsWith("seed.ts");
if (isDirectInvocation) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
