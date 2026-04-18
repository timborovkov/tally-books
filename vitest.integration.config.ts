import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    // Schema integration tests share a single database — running them
    // in parallel would let the TRUNCATE in one test wipe data another
    // test just inserted. Single-threaded keeps the tests honest.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
