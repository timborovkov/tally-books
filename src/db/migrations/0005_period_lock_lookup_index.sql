-- Hand-written migration (not from drizzle-kit). Adds a partial covering
-- index for `assertPeriodUnlocked` in src/lib/versioning/period-lock.ts.
-- The existing `financial_periods_entity_kind_start_idx` leads with
-- (entity_id, kind, start_at) but `assertPeriodUnlocked` doesn't filter
-- on `kind` and also needs `end_at`. This index matches the hot-path
-- predicate exactly and excludes unlocked rows — the common case — so
-- the index stays small.
--
-- drizzle-kit can't express partial indexes that are not declared on the
-- Drizzle schema. This index exists only at the SQL layer; the schema
-- definition stays unchanged.
CREATE INDEX "financial_periods_lock_lookup_idx"
  ON "financial_periods" USING btree ("entity_id", "start_at", "end_at")
  WHERE "locked" = true;
