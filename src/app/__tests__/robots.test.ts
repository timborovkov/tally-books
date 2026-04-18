import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards the SEO stance: Tally is single-tenant and must never be indexed.
 * Reads the real `public/robots.txt` file shipped with the app and asserts
 * the disallow-all directive is present. Catches accidental deletion or
 * re-scoping of the file during future changes.
 */
describe("public/robots.txt", () => {
  it("disallows all user-agents", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const robotsPath = resolve(here, "../../../public/robots.txt");
    const contents = await readFile(robotsPath, "utf8");

    expect(contents).toMatch(/^User-agent:\s*\*/m);
    expect(contents).toMatch(/^Disallow:\s*\/\s*$/m);
  });
});
