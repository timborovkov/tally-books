import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard against drizzle-kit silently regenerating a non-DEFERRABLE FK on
 * `receipts.current_version_id`. data-structure.md §3.1 requires the FK
 * between a versioned Thing's parent row and its `<thing>_versions.id`
 * to be `DEFERRABLE INITIALLY DEFERRED` so both rows can be inserted in
 * the same transaction. drizzle-kit can't emit that clause, so the FK
 * lives hand-edited at the tail of 0004_smooth_maria_hill.sql.
 *
 * If someone adds `.references(() => receiptVersions.id)` to
 * `receipts.currentVersionId` in src/db/schema/receipts.ts, the next
 * `pnpm db:generate` will emit a duplicate non-DEFERRABLE constraint
 * with the same name. This test fails the build before that ships.
 */
describe("versioned-table FK invariants", () => {
  const repoRoot = path.resolve(__dirname, "../../..");

  it("0004_smooth_maria_hill.sql declares DEFERRABLE FK for receipts.current_version_id", () => {
    const sql = readFileSync(
      path.join(repoRoot, "src/db/migrations/0004_smooth_maria_hill.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /ALTER TABLE "receipts".+ADD CONSTRAINT "receipts_current_version_id_receipt_versions_id_fk".+DEFERRABLE INITIALLY DEFERRED/s,
    );
  });

  it("src/db/schema/receipts.ts does not wire currentVersionId via .references()", () => {
    const src = readFileSync(path.join(repoRoot, "src/db/schema/receipts.ts"), "utf8");
    // currentVersionId must stay unwired: the FK is hand-edited in SQL.
    expect(src).toMatch(/currentVersionId:\s*text\("current_version_id"\)(?!\s*\.references)/);
  });
});
