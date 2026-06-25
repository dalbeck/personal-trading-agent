import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DISCOVERY_LIMITS } from "@strategy/charter.config";
import { readWatchlist, readWatchlistEntries } from "./data";
import {
  addDiscoveredToWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "./writers";

describe("watchlist persistence (entries + provenance)", () => {
  let dir: string;
  const opts = () => ({ dataDir: dir, at: "2026-06-25T12:00:00-04:00" });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "watchlist-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads empty when no file exists", async () => {
    expect(await readWatchlistEntries({ dataDir: dir })).toEqual([]);
    expect(await readWatchlist({ dataDir: dir })).toEqual([]);
  });

  it("adds manual entries, normalizes case, and is idempotent", async () => {
    await addToWatchlist("nvda", opts());
    const after = await addToWatchlist("NVDA", opts());
    expect(after.map((e) => e.symbol)).toEqual(["NVDA"]);
    expect(after[0].source).toBe("manual");
    expect(await readWatchlist({ dataDir: dir })).toEqual(["NVDA"]);
  });

  it("removes a symbol (case-insensitive), idempotent", async () => {
    await addToWatchlist("NVDA", opts());
    await addToWatchlist("AAPL", opts());
    const after = await removeFromWatchlist("nvda", opts());
    expect(after.map((e) => e.symbol)).toEqual(["AAPL"]);
    expect(await removeFromWatchlist("NVDA", opts())).toHaveLength(1);
  });

  describe("addDiscoveredToWatchlist", () => {
    it("adds candidates as discovery entries, skipping invalid + dupes", async () => {
      await addToWatchlist("NVDA", opts()); // existing manual
      const { entries, added } = await addDiscoveredToWatchlist(
        ["AAPL", "nvda", "not a ticker", "MSFT"],
        opts(),
      );
      expect(added).toEqual(["AAPL", "MSFT"]); // NVDA dupe + junk skipped
      const byS = Object.fromEntries(entries.map((e) => [e.symbol, e.source]));
      expect(byS).toEqual({ NVDA: "manual", AAPL: "discovery", MSFT: "discovery" });
    });

    it("never grows past the watchlist ceiling", async () => {
      const many = Array.from(
        { length: DISCOVERY_LIMITS.maxWatchlistSymbols + 5 },
        (_, i) => `T${i}`,
      );
      const { entries, added } = await addDiscoveredToWatchlist(many, opts());
      expect(entries).toHaveLength(DISCOVERY_LIMITS.maxWatchlistSymbols);
      expect(added).toHaveLength(DISCOVERY_LIMITS.maxWatchlistSymbols);
    });

    it("never evicts a manual entry to make room", async () => {
      await addToWatchlist("KEEP", opts());
      const many = Array.from(
        { length: DISCOVERY_LIMITS.maxWatchlistSymbols + 5 },
        (_, i) => `T${i}`,
      );
      const { entries } = await addDiscoveredToWatchlist(many, opts());
      expect(entries).toHaveLength(DISCOVERY_LIMITS.maxWatchlistSymbols);
      expect(entries.find((e) => e.symbol === "KEEP")?.source).toBe("manual");
    });
  });

  it("a human re-adding a discovered symbol promotes it to manual", async () => {
    await addDiscoveredToWatchlist(["AAPL"], opts());
    const after = await addToWatchlist("AAPL", opts());
    expect(after.find((e) => e.symbol === "AAPL")?.source).toBe("manual");
  });

  it("migrates the legacy { symbols: [...] } shape to manual entries", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(dir, "control"), { recursive: true });
    await writeFile(
      path.join(dir, "control", "watchlist.json"),
      JSON.stringify({ symbols: ["NVDA", "AAPL"] }),
      "utf8",
    );
    const entries = await readWatchlistEntries({ dataDir: dir });
    expect(entries.map((e) => e.symbol)).toEqual(["NVDA", "AAPL"]);
    expect(entries.every((e) => e.source === "manual")).toBe(true);
  });
});
