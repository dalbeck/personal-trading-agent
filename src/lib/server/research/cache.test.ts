import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readResearchCache, writeResearchCache } from "./cache";
import type { SymbolResearch } from "./types";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-research-cache-"));
}

function payload(): SymbolResearch {
  return {
    fundamentals: { marketCap: 3e12, peRatio: 30, eps: 11.9, dividendYield: 0.007 },
    fundamentalsSource: "robinhood",
    profile: {
      ceo: "Satya Nadella",
      employees: 228000,
      sector: "Technology",
      industry: "Software",
      country: null,
      exchange: null,
      ipoDate: null,
      description: "Cloud + software.",
    },
    profileSource: "robinhood",
    consensus: null,
    summary: "Solid.",
    finance: [],
    categories: [],
    sources: [],
    usedAt: null,
    cost: null,
    robinhoodConnected: true,
    perplexity: "off",
    cached: false,
  };
}

describe("research cache", () => {
  it("round-trips a payload, marking the read copy as cached", async () => {
    const dir = await tmp();
    await writeResearchCache("MSFT", "2026-06-25", payload(), { dataDir: dir });
    const got = await readResearchCache("MSFT", "2026-06-25", { dataDir: dir });
    expect(got).not.toBeNull();
    expect(got!.cached).toBe(true);
    expect(got!.fundamentals!.marketCap).toBe(3e12);
    expect(got!.profile!.ceo).toBe("Satya Nadella");
  });

  it("returns null on a miss (no file)", async () => {
    const dir = await tmp();
    expect(await readResearchCache("AMD", "2026-06-25", { dataDir: dir })).toBeNull();
  });

  it("is scoped per symbol and per day", async () => {
    const dir = await tmp();
    await writeResearchCache("MSFT", "2026-06-25", payload(), { dataDir: dir });
    expect(await readResearchCache("MSFT", "2026-06-26", { dataDir: dir })).toBeNull();
    expect(await readResearchCache("AMD", "2026-06-25", { dataDir: dir })).toBeNull();
  });

  it("treats a malformed cache file as a miss (never throws)", async () => {
    const dir = await tmp();
    const file = path.join(dir, "research", "cache", "2026-06-25-MSFT.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ not json", "utf8");
    expect(await readResearchCache("MSFT", "2026-06-25", { dataDir: dir })).toBeNull();
  });
});
