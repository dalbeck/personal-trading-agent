import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLiveHighWater, updateLiveHighWater } from "./live-high-water";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-hw-"));
}

describe("live high-water store", () => {
  it("reads 0 when no mark has been persisted", async () => {
    const dataDir = await tmp();
    expect(await readLiveHighWater({ dataDir })).toBe(0);
  });

  it("sets the mark to the first equity seen and persists it", async () => {
    const dataDir = await tmp();
    const hw = await updateLiveHighWater(10_000, { dataDir });
    expect(hw).toBe(10_000);
    expect(await readLiveHighWater({ dataDir })).toBe(10_000);
  });

  it("raises the mark when equity climbs", async () => {
    const dataDir = await tmp();
    await updateLiveHighWater(10_000, { dataDir });
    const hw = await updateLiveHighWater(12_000, { dataDir });
    expect(hw).toBe(12_000);
    expect(await readLiveHighWater({ dataDir })).toBe(12_000);
  });

  it("never lowers the mark when equity falls (monotonic)", async () => {
    const dataDir = await tmp();
    await updateLiveHighWater(12_000, { dataDir });
    const hw = await updateLiveHighWater(9_000, { dataDir });
    expect(hw).toBe(12_000);
    expect(await readLiveHighWater({ dataDir })).toBe(12_000);
  });
});
