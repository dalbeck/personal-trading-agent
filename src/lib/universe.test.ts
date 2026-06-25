import { describe, expect, it } from "vitest";
import {
  buildUniverse,
  classifyOwnership,
  dedupeSymbols,
  isTracked,
} from "./universe";

describe("tracked universe", () => {
  describe("dedupeSymbols", () => {
    it("normalizes case + whitespace and dedupes, preserving order", () => {
      expect(dedupeSymbols([" nvda ", "MSFT", "nvda", "msft"])).toEqual([
        "NVDA",
        "MSFT",
      ]);
    });

    it("drops invalid tickers", () => {
      expect(dedupeSymbols(["NVDA", "", "bad symbol", "A.B", "TOOLONGTICKER12"]))
        .toEqual(["NVDA", "A.B"]);
    });
  });

  describe("buildUniverse", () => {
    it("unions holdings + watchlist with holdings first, deduped", () => {
      const u = buildUniverse(["NVDA", "MSFT"], ["msft", "AAPL"]);
      expect(u.holdings).toEqual(["NVDA", "MSFT"]);
      expect(u.watchlist).toEqual(["MSFT", "AAPL"]);
      expect(u.symbols).toEqual(["NVDA", "MSFT", "AAPL"]);
    });

    it("is empty when nothing is held or watched", () => {
      expect(buildUniverse([], [])).toEqual({
        holdings: [],
        watchlist: [],
        symbols: [],
      });
    });
  });

  describe("classifyOwnership", () => {
    const u = buildUniverse(["NVDA"], ["AAPL"]);

    it("ranks held over watchlist over none", () => {
      expect(classifyOwnership("nvda", u)).toBe("held");
      expect(classifyOwnership("AAPL", u)).toBe("watchlist");
      expect(classifyOwnership("TSLA", u)).toBe("none");
    });

    it("treats a held symbol that is also watched as held", () => {
      const both = buildUniverse(["NVDA"], ["NVDA"]);
      expect(classifyOwnership("NVDA", both)).toBe("held");
    });
  });

  it("isTracked is true for held or watched, false otherwise", () => {
    const u = buildUniverse(["NVDA"], ["AAPL"]);
    expect(isTracked("NVDA", u)).toBe(true);
    expect(isTracked("AAPL", u)).toBe(true);
    expect(isTracked("TSLA", u)).toBe(false);
  });
});
