import "@testing-library/jest-dom/vitest";

// Provide safe defaults for required env vars so env.ts validation passes
// in unit tests. Integration tests must set DATABASE_URL themselves so
// they hit the real Postgres service (see vitest.integration.config.ts).
process.env.DATABASE_URL ??= "postgres://tally:tally@localhost:5432/tally_test";
