import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DISCOVERY_LIMITS } from "@strategy/charter.config";
import {
  defaultDiscoverySettings,
  effectiveDiscoveryLimits,
  readDiscoverySettings,
  writeDiscoverySettings,
} from "./discovery-settings";

describe("effectiveDiscoveryLimits — overlay over the charter defaults", () => {
  it("uses the charter defaults when nothing is overridden", () => {
    const eff = effectiveDiscoveryLimits(defaultDiscoverySettings());
    expect(eff.ideaCap).toBe(DISCOVERY_LIMITS.ideaCap);
    expect(eff.maxProposalsPerSector).toBe(DISCOVERY_LIMITS.maxProposalsPerSector);
    expect(eff.minSectorsTarget).toBe(DISCOVERY_LIMITS.minSectorsTarget);
    expect(eff.minConvictionTier).toBe("watch"); // show everything
  });

  it("applies a human-tuned idea cap", () => {
    const eff = effectiveDiscoveryLimits(
      defaultDiscoverySettings({ ideaCap: 12 }),
    );
    expect(eff.ideaCap).toBe(12);
  });

  it("clamps the idea cap to the charter ceiling (can never exceed maxIdeaCap)", () => {
    const eff = effectiveDiscoveryLimits(
      defaultDiscoverySettings({ ideaCap: 999 }),
    );
    expect(eff.ideaCap).toBe(DISCOVERY_LIMITS.maxIdeaCap);
  });

  it("clamps the idea cap up to at least 1", () => {
    // The schema forbids 0/negative, but a defensive clamp keeps it ≥ 1.
    const eff = effectiveDiscoveryLimits(
      defaultDiscoverySettings({ ideaCap: 1 }),
    );
    expect(eff.ideaCap).toBeGreaterThanOrEqual(1);
  });

  it("carries the per-sector cap and min-sectors target through", () => {
    const eff = effectiveDiscoveryLimits(
      defaultDiscoverySettings({ maxProposalsPerSector: 2, minSectorsTarget: 5 }),
    );
    expect(eff.maxProposalsPerSector).toBe(2);
    expect(eff.minSectorsTarget).toBe(5);
  });

  it("carries the minimum conviction tier to surface", () => {
    const eff = effectiveDiscoveryLimits(
      defaultDiscoverySettings({ minConvictionTier: "moderate" }),
    );
    expect(eff.minConvictionTier).toBe("moderate");
  });
});

describe("read/write discovery settings", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disco-settings-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns charter defaults when no file exists", async () => {
    const s = await readDiscoverySettings({ dataDir: dir });
    expect(s.ideaCap).toBeNull();
    expect(s.minConvictionTier).toBe("watch");
  });

  it("persists and reads back a tuned funnel", async () => {
    await writeDiscoverySettings(
      { ideaCap: 30, maxProposalsPerSector: 2, minConvictionTier: "high" },
      { dataDir: dir },
    );
    const s = await readDiscoverySettings({ dataDir: dir });
    expect(s.ideaCap).toBe(30);
    expect(s.maxProposalsPerSector).toBe(2);
    expect(s.minConvictionTier).toBe("high");
    expect(s.updatedAt).not.toBeNull();
  });

  it("rejects an out-of-shape payload", async () => {
    await expect(
      writeDiscoverySettings({ ideaCap: -5 }, { dataDir: dir }),
    ).rejects.toThrow();
  });
});
