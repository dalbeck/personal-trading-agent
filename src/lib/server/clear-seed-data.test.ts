import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Behavior coverage for scripts/clear-seed-data.sh — the "Clear sample data"
 * Operations action. The action removes only `sample: true`-flagged files, so
 * its report must be HONEST: when nothing is flagged but unflagged artifacts
 * still remain, it must say so and point the user at "Reset desk data" rather
 * than implying the panels are clean.
 */

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts", "clear-seed-data.sh");

let dataDir: string;

async function seed(rel: string, body: string): Promise<void> {
  const abs = path.join(dataDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
}

async function exists(rel: string): Promise<boolean> {
  try {
    await stat(path.join(dataDir, rel));
    return true;
  } catch {
    return false;
  }
}

function clear(): Promise<{ stdout: string; stderr: string }> {
  return run("/bin/bash", [SCRIPT], {
    env: { ...process.env, TRADING_DATA_DIR: dataDir },
  });
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "clear-seed-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("clear-seed-data.sh", () => {
  it("removes sample-flagged files and leaves live records untouched", async () => {
    await seed("proposals/seed.json", '{"sample": true, "symbol": "MSFT"}');
    await seed("news/seed.json", '{"sample": true}');
    await seed("proposals/live.json", '{"symbol": "NVDA"}');

    const { stdout } = await clear();

    expect(await exists("proposals/seed.json")).toBe(false);
    expect(await exists("news/seed.json")).toBe(false);
    expect(await exists("proposals/live.json")).toBe(true);
    expect(stdout).toContain("Cleared 2 sample-flagged file(s)");
  });

  it("reports honestly when nothing is flagged but unflagged files remain", async () => {
    // Live/seed-without-marker records: not flagged, so nothing is deleted.
    await seed("snapshots/2026-06-20.json", '{"account": "paper"}');
    await seed("decision-journal/2026-06-20-nvda.md", "---\nkind: trade\n---\n");
    await seed("logs/run-1.json", '{"routine": "midday-scan"}');

    const { stdout } = await clear();

    // Nothing deleted...
    expect(await exists("snapshots/2026-06-20.json")).toBe(true);
    // ...and the report must NOT imply the desk is clean.
    expect(stdout).not.toMatch(/nothing to clear/i);
    expect(stdout).toContain("No sample-flagged files found");
    expect(stdout).toContain("3 other file(s) remain");
    expect(stdout).toMatch(/Reset desk data/);
  });

  it("says nothing to clear only when the desk is genuinely empty", async () => {
    await mkdir(path.join(dataDir, "proposals"), { recursive: true });
    const { stdout } = await clear();
    expect(stdout).toMatch(/nothing to clear/i);
  });

  it("after clearing flagged files, still flags any remaining unflagged ones", async () => {
    await seed("proposals/seed.json", '{"sample": true}');
    await seed("snapshots/live.json", '{"account": "paper"}');

    const { stdout } = await clear();

    expect(stdout).toContain("Cleared 1 sample-flagged file(s)");
    expect(stdout).toContain("1 other (unflagged) file(s) remain");
    expect(stdout).toMatch(/Reset desk data/);
  });

  it("does not count the runtime/safety dirs (locks/, control/) as remaining", async () => {
    await seed("locks/routine.lock", "pid");
    await seed("control/live-halt.json", '{"halted": true}');

    const { stdout } = await clear();

    // Only locks/control present → genuinely no desk artifacts remain.
    expect(stdout).toMatch(/nothing to clear/i);
    expect(await exists("control/live-halt.json")).toBe(true);
    expect(await readdir(path.join(dataDir, "locks"))).toHaveLength(1);
  });
});
