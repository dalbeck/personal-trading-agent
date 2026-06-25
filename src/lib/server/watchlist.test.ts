import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWatchlist } from "./data";
import {
  addToWatchlist,
  removeFromWatchlist,
  writeWatchlist,
} from "./writers";

describe("watchlist persistence", () => {
  let dir: string;
  const opts = () => ({ dataDir: dir, at: "2026-06-25T12:00:00-04:00" });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "watchlist-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads empty when no file exists", async () => {
    expect(await readWatchlist({ dataDir: dir })).toEqual([]);
  });

  it("writes, normalizes, and dedupes; reads back", async () => {
    const written = await writeWatchlist([" nvda ", "MSFT", "nvda"], opts());
    expect(written).toEqual(["NVDA", "MSFT"]);
    expect(await readWatchlist({ dataDir: dir })).toEqual(["NVDA", "MSFT"]);
  });

  it("add is idempotent and normalizes case", async () => {
    await addToWatchlist("nvda", opts());
    const after = await addToWatchlist("NVDA", opts());
    expect(after).toEqual(["NVDA"]);
  });

  it("remove takes a symbol out (case-insensitive), idempotent", async () => {
    await writeWatchlist(["NVDA", "AAPL"], opts());
    const after = await removeFromWatchlist("nvda", opts());
    expect(after).toEqual(["AAPL"]);
    expect(await removeFromWatchlist("NVDA", opts())).toEqual(["AAPL"]);
  });

  it("rejects invalid tickers silently (dropped on write)", async () => {
    const written = await writeWatchlist(["NVDA", "not a ticker"], opts());
    expect(written).toEqual(["NVDA"]);
  });
});
