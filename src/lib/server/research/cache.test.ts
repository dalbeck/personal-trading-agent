import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readResearchCache, writeResearchCache } from "./cache";
import type { SymbolResearch } from "./types";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-research-cache-"));
}

const FETCHED_AT = "2026-06-25T14:00:00.000Z";

function payload(): SymbolResearch {
  return {
    fundamentals: { marketCap: 3e12, peRatio: 30, eps: 11.9, dividendYield: 0.007 },
    fundamentalsSource: "robinhood",
    profile: {
      name: "Microsoft Corporation",
      domain: null,
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
    earnings: [],
    catalysts: [],
    cashFlow: null,
    cashFlowSource: null,
    dividend: null,
    dividendSource: null,
    finance: [],
    sections: [],
    categories: [],
    sources: [],
    usedAt: null,
    cost: null,
    robinhoodConnected: true,
    perplexity: "off",
    perplexityReason: null,
    cached: false,
    fetchedAt: null,
  };
}

const cacheFilePath = (dir: string, symbol: string) =>
  path.join(dir, "research", "cache", `${symbol}.json`);

describe("research cache", () => {
  it("round-trips a payload, marking the read copy cached and stamping fetchedAt", async () => {
    const dir = await tmp();
    await writeResearchCache("MSFT", payload(), FETCHED_AT, { dataDir: dir });
    const got = await readResearchCache("MSFT", { dataDir: dir });
    expect(got).not.toBeNull();
    expect(got!.cached).toBe(true);
    expect(got!.fetchedAt).toBe(FETCHED_AT);
    expect(got!.fundamentals!.marketCap).toBe(3e12);
    expect(got!.profile!.ceo).toBe("Satya Nadella");
  });

  it("is keyed by symbol only (no date in the filename)", async () => {
    const dir = await tmp();
    await writeResearchCache("MSFT", payload(), FETCHED_AT, { dataDir: dir });
    // The file lives at <SYMBOL>.json, and a different symbol is a miss.
    await expect(readFile(cacheFilePath(dir, "MSFT"), "utf8")).resolves.toContain(
      "Satya Nadella",
    );
    expect(await readResearchCache("AMD", { dataDir: dir })).toBeNull();
  });

  it("returns null on a miss (no file)", async () => {
    const dir = await tmp();
    expect(await readResearchCache("AMD", { dataDir: dir })).toBeNull();
  });

  it("treats a malformed cache file as a miss (never throws)", async () => {
    const dir = await tmp();
    const file = cacheFilePath(dir, "MSFT");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ not json", "utf8");
    expect(await readResearchCache("MSFT", { dataDir: dir })).toBeNull();
  });

  it("treats a prior-version (date-keyed, no fetchedAt) entry as a miss", async () => {
    const dir = await tmp();
    const file = cacheFilePath(dir, "MSFT");
    await mkdir(path.dirname(file), { recursive: true });
    // An old v4 entry without the version/fetchedAt the current shape requires.
    await writeFile(file, JSON.stringify({ ...payload(), version: 4 }), "utf8");
    expect(await readResearchCache("MSFT", { dataDir: dir })).toBeNull();
  });
});
