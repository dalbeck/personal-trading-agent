import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Behavior coverage for scripts/reset-desk-data.sh — the "Reset desk data"
 * Operations action. Asserts it clears ALL desk artifacts under the resolved
 * DATA_DIR (honoring TRADING_DATA_DIR), keeps the directories, reports what it
 * removed, leaves the runtime/safety dirs (locks/, control/) untouched, and is
 * idempotent.
 */

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts", "reset-desk-data.sh");

let dataDir: string;

async function seed(rel: string, body = "{}"): Promise<void> {
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

/** Run the script with TRADING_DATA_DIR pointed at the temp data root. */
function reset(): Promise<{ stdout: string; stderr: string }> {
  return run("/bin/bash", [SCRIPT], {
    env: { ...process.env, TRADING_DATA_DIR: dataDir },
  });
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "reset-desk-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("reset-desk-data.sh", () => {
  it("removes every artifact file but keeps the directories", async () => {
    await seed("snapshots/2026-06-20.json");
    await seed("decision-journal/2026-06-20-msft-buy.md", "---\nkind: trade\n---\n");
    await seed("coaching-log/2026-06-20.md", "---\ngrade: B\n---\n");
    await seed("proposals/p-1.json");
    await seed("news/2026-06-20.json");
    await seed("logs/run-1.json");
    await seed("research/2026-06-20.json");

    const { stdout } = await reset();

    // Directories survive; their files are gone.
    for (const dir of [
      "snapshots",
      "decision-journal",
      "coaching-log",
      "proposals",
      "news",
      "logs",
      "research",
    ]) {
      expect(await exists(dir)).toBe(true);
      expect(await readdir(path.join(dataDir, dir))).toHaveLength(0);
    }

    // Reports the resolved dir and an exact count.
    expect(stdout).toContain(`Resetting desk data under ${dataDir}`);
    expect(stdout).toContain("removed 7 desk artifact file(s)");
  });

  it("operates on the resolved DATA_DIR (TRADING_DATA_DIR), not ./data", async () => {
    await seed("proposals/p-1.json");
    const { stdout } = await reset();
    expect(stdout).toContain(dataDir);
    expect(stdout).not.toMatch(/removed 0/);
  });

  it("does NOT touch the runtime/safety dirs (locks/, control/)", async () => {
    await seed("logs/run-1.json");
    await seed("locks/routine.lock", "pid");
    await seed("control/live-halt.json", '{"halted":true}');
    await seed("control/funding.json", '{"deposits":[]}');

    await reset();

    expect(await exists("locks/routine.lock")).toBe(true);
    expect(await exists("control/live-halt.json")).toBe(true);
    expect(await exists("control/funding.json")).toBe(true);
    expect(await exists("logs/run-1.json")).toBe(false);
  });

  it("is idempotent — a second run removes nothing and says so", async () => {
    await seed("proposals/p-1.json");
    await reset();
    const { stdout } = await reset();
    expect(stdout).toContain("already clean");
  });
});
