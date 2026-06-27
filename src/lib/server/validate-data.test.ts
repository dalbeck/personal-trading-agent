import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateDataDir } from "./validate-data";

const FIXTURES = path.resolve(process.cwd(), "src/test/fixtures");

// `pnpm validate:data` points this at the live `data/` dir; the plain test run
// validates the committed fixtures.
const TARGET = process.env.VALIDATE_DATA_DIR
  ? path.resolve(process.cwd(), process.env.VALIDATE_DATA_DIR)
  : FIXTURES;

const VALID_JOURNAL = `---
kind: trade
id: j-test
timestamp: "2026-06-20T09:41:00-04:00"
symbol: MSFT
action: buy
side: long
qty: 9
price: 432.75
stopPrice: 415
takeProfit: 478
riskPct: 0.0152
reviewDate: "2026-07-21"
tags: [megacap]
---

Body prose.
`;

let tmp: string | null = null;
afterEach(() => {
  tmp = null;
});

async function makeDir(
  files: Record<string, string>,
): Promise<string> {
  tmp = await mkdtemp(path.join(tmpdir(), "pta-validate-"));
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(tmp, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, contents);
  }
  return tmp;
}

describe("validateDataDir", () => {
  it("reports no problems for the target data set", async () => {
    const problems = await validateDataDir(TARGET);
    expect(problems).toEqual([]);
  });

  it("flags a narrative entry missing a required frontmatter field", async () => {
    const broken = VALID_JOURNAL.replace(/^symbol: MSFT\n/m, "");
    const dir = await makeDir({ "decision-journal/bad.md": broken });
    const problems = await validateDataDir(dir);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].file).toBe(path.join("decision-journal", "bad.md"));
    expect(problems[0].problem).toMatch(/symbol/);
  });

  it("flags a stray .json file in a narrative (markdown) directory", async () => {
    const dir = await makeDir({
      "decision-journal/ok.md": VALID_JOURNAL,
      "decision-journal/legacy.json": "{}",
    });
    const problems = await validateDataDir(dir);
    expect(problems.some((p) => p.file.endsWith("legacy.json"))).toBe(true);
  });

  it("flags malformed frontmatter", async () => {
    const dir = await makeDir({
      "coaching-log/bad.md": "no frontmatter at all\n",
    });
    const problems = await validateDataDir(dir);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].problem).toMatch(/frontmatter/i);
  });

  it("returns no problems when a directory is absent", async () => {
    const dir = await makeDir({ "snapshots/2026-06-22.json": "{}" });
    // snapshots/ contains invalid JSON shape, but decision-journal/ is absent —
    // absence is fine; only the present bad snapshot should be reported.
    const problems = await validateDataDir(dir);
    expect(problems.every((p) => p.file.startsWith("snapshots"))).toBe(true);
  });

  it("ignores the research diagnostics ring (internal state, not a contract)", async () => {
    const ring = JSON.stringify([
      {
        at: "2026-06-24T08:00:00.000Z",
        provider: "perplexity",
        symbol: "MSFT",
        outcome: "no-api-key",
        latencyMs: 0,
      },
    ]);
    const usage = JSON.stringify({ date: "2026-06-24", count: 1 });
    const dir = await makeDir({
      "research/diagnostics.json": ring,
      "research/usage-2026-06-24.json": usage,
    });
    const problems = await validateDataDir(dir);
    expect(problems).toEqual([]);
  });
});
