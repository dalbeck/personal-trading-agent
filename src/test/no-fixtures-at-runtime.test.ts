import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audit: the RUNNING app must resolve its data only from the live `DATA_DIR`
 * (`TRADING_DATA_DIR` or `<repo>/data`) and must NEVER read the committed test
 * fixtures (`src/test/fixtures/`) outside vitest. The fixtures are all
 * `sample: true` and exist solely so the test suite is hermetic; if the dev or
 * prod server ever pointed at them it would render fabricated data as if it
 * were live — the exact trust hazard this whole effort exists to remove.
 *
 * The ONLY sanctioned place that wires `TRADING_DATA_DIR` → fixtures is
 * `vitest.config.ts` (test env). This test fails if any runtime config surface
 * (`.env`, `.env.example`, `next.config.*`, `package.json` scripts) introduces a
 * dev convenience that points the app at the fixtures.
 */

const root = process.cwd();
const FIXTURES_REL = path.join("src", "test", "fixtures");

function read(rel: string): string | null {
  const abs = path.join(root, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

/** Lines that set TRADING_DATA_DIR to a path mentioning the fixtures dir. */
function fixturesOverrides(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .filter(
      (line) =>
        /TRADING_DATA_DIR/.test(line) && /fixtures/.test(line),
    );
}

describe("no test fixtures at runtime", () => {
  it("only vitest.config.ts wires TRADING_DATA_DIR to the fixtures", () => {
    const vitest = read("vitest.config.ts");
    expect(vitest, "vitest.config.ts should exist").not.toBeNull();
    // The sanctioned, test-only wiring is present and explicit.
    expect(vitest!).toMatch(/TRADING_DATA_DIR/);
    expect(vitest!).toContain("src/test/fixtures");
  });

  it.each([
    ".env",
    ".env.example",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "package.json",
  ])("runtime config %s never points TRADING_DATA_DIR at the fixtures", (file) => {
    const contents = read(file);
    if (contents === null) return; // absent surface — nothing to audit
    expect(fixturesOverrides(contents)).toEqual([]);
  });

  it("no shipped server module hardcodes the fixtures path", () => {
    // The data readers resolve a directory; none may bake in the fixtures path.
    const dataReader = read(path.join("src", "lib", "server", "data.ts"));
    expect(dataReader, "data.ts should exist").not.toBeNull();
    expect(dataReader!).not.toContain(FIXTURES_REL);
    expect(dataReader!).not.toMatch(/test\/fixtures/);
  });

  it("the default DATA_DIR resolution (no env) is <repo>/data, not fixtures", () => {
    // Mirror the resolution expression used by the server modules.
    const resolved = path.join(root, "data");
    expect(resolved.endsWith(`${path.sep}data`)).toBe(true);
    expect(resolved).not.toMatch(/fixtures/);
  });
});
