import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultAllocationTargets,
  readAllocationTargets,
  writeAllocationTargets,
} from "./allocation-targets";

describe("allocation targets (portfolio M5)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "alloc-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("defaults to empty (no mix set) with a 5-point drift band", () => {
    const d = defaultAllocationTargets();
    expect(d.targets).toEqual([]);
    expect(d.driftBandPct).toBe(0.05);
    expect(d.blendedBenchmark).toBe("SPY total return");
  });

  it("reads the empty default when no file exists", async () => {
    expect((await readAllocationTargets({ dataDir: dir })).targets).toEqual([]);
  });

  it("round-trips a human-set mix and stamps updatedAt", async () => {
    await writeAllocationTargets(
      {
        targets: [
          { sleeve: "core-long", targetWeightPct: 0.6 },
          { sleeve: "position-mid", targetWeightPct: 0.25 },
          { sleeve: "swing-trend", targetWeightPct: 0.15 },
        ],
        driftBandPct: 0.08,
      },
      { dataDir: dir },
    );
    const t = await readAllocationTargets({ dataDir: dir });
    expect(t.targets).toHaveLength(3);
    expect(t.driftBandPct).toBe(0.08);
    expect(t.updatedAt).not.toBeNull();
  });

  it("rejects duplicate sleeves", async () => {
    await expect(
      writeAllocationTargets(
        {
          targets: [
            { sleeve: "core-long", targetWeightPct: 0.3 },
            { sleeve: "core-long", targetWeightPct: 0.3 },
          ],
        },
        { dataDir: dir },
      ),
    ).rejects.toThrow();
  });

  it("rejects targets that sum to more than 100%", async () => {
    await expect(
      writeAllocationTargets(
        {
          targets: [
            { sleeve: "core-long", targetWeightPct: 0.7 },
            { sleeve: "swing-trend", targetWeightPct: 0.5 },
          ],
        },
        { dataDir: dir },
      ),
    ).rejects.toThrow();
  });
});
