import { defineConfig } from "drizzle-kit";

// drizzle-kit loads .env automatically. This file is a CLI config and
// runs outside the app process, so we read process.env directly rather
// than going through src/lib/env.ts (which also has runtime side effects
// that other tools loading this config don't want to trigger).
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
