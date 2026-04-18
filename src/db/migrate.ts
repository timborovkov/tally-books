/**
 * CLI: apply pending migrations to the database pointed at by DATABASE_URL.
 *
 * Run with `pnpm db:migrate`. Idempotent — safe to re-run; drizzle-kit
 * tracks applied migrations in its `__drizzle_migrations` table.
 */
/* eslint-disable no-console -- CLI script: stdout is the user-facing surface. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "@/lib/env";

async function main(): Promise<void> {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log(`Running migrations against ${redact(env.DATABASE_URL)}…`);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied.");

  await client.end();
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url;
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
