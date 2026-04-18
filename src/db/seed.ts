/**
 * CLI: seed dev data.
 *
 * Run with `pnpm db:seed`. Idempotent — uses ON CONFLICT DO NOTHING.
 *
 * v0.1 scope: only the bootstrap admin user. Entity tables don't land
 * until the next TODO section ("Entities & jurisdictions"); example
 * entity seeds will be added there.
 */
/* eslint-disable no-console -- CLI script: stdout is the user-facing surface. */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { newId } from "@/db/id";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

async function main(): Promise<void> {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const adminEmail = env.SEED_ADMIN_EMAIL;

  // bootstrap_completed_at = NULL satisfies the 2FA CHECK during seeding;
  // the real bootstrap wizard sets it once the admin enables 2FA.
  const inserted = await db
    .insert(schema.users)
    .values({
      id: newId(),
      email: adminEmail,
      name: "Bootstrap admin",
      role: "admin",
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning({ id: schema.users.id });

  if (inserted.length > 0) {
    console.log(`Seeded admin user: ${adminEmail}`);
  } else {
    console.log(`Admin user ${adminEmail} already exists — skipped.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
