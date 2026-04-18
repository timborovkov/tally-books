/**
 * Shared Drizzle client for runtime use (server actions, route handlers,
 * background workers). CLI scripts (`migrate.ts`, `seed.ts`) and
 * integration tests still build their own short-lived client because
 * they need explicit lifecycle control (`await client.end()` after
 * the work is done) — the runtime client lives for the process lifetime.
 *
 * The `Db` type alias is what services accept as their first argument,
 * so production callers pass the singleton and tests pass an
 * ephemeral test client without touching the service signatures.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; client: ReturnType<typeof postgres> } | null = null;

export function getDb(): Db {
  if (!cached) {
    const client = postgres(env.DATABASE_URL);
    const db = drizzle(client, { schema });
    cached = { db, client };
  }
  return cached.db;
}
