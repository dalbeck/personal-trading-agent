import { describe, expect, it } from "vitest";
import type { AlpacaOhlcBar, AlpacaSnapshot } from "./alpaca";
import {
  barToPoint,
  latestSessionOnly,
  mapNews,
  mapSnapshotToQuote,
  quoteFromDailyBars,
  rangeWindow,
  week52Range,
} from "./symbol";

function bar(t: string, o: number, h: number, l: number, c: number, v = 1000): AlpacaOhlcBar {
  return { t, o, h, l, c, v };
}

// 2026-06-24T17:00:00Z — a fixed clock so window math is deterministic.
const NOW = new Date("2026-06-24T17:00:00.000Z");

describe("rangeWindow", () => {
  it("uses intraday minutes for 1D/1W and daily bars beyond", () => {
    expect(rangeWindow("1D", NOW).timeframe).toBe("5Min");
    expect(rangeWindow("1W", NOW).timeframe).toBe("30Min");
    expect(rangeWindow("1M", NOW).timeframe).toBe("1Day");
    expect(rangeWindow("3M", NOW).timeframe).toBe("1Day");
    expect(rangeWindow("1Y", NOW).timeframe).toBe("1Day");
  });

  it("flags only 1D for latest-session trimming", () => {
    expect(rangeWindow("1D", NOW).sessionOnly).toBe(true);
    expect(rangeWindow("1W", NOW).sessionOnly).toBe(false);
  });

  it("computes the lookback start relative to now", () => {
    // 1Y → 370 days before the clock.
    expect(rangeWindow("1Y", NOW).start).toBe(
      new Date("2025-06-19T17:00:00.000Z").toISOString(),
    );
  });
});

describe("barToPoint", () => {
  it("maps a raw Alpaca bar to a full OHLCV chart point", () => {
    const p = barToPoint(bar("2026-06-24T13:30:00Z", 100, 107, 99, 104, 5_000_000));
    expect(p).toEqual({
      t: "2026-06-24T13:30:00Z",
      o: 100,
      h: 107,
      l: 99,
      c: 104,
      v: 5_000_000,
    });
  });
});

describe("latestSessionOnly", () => {
  it("keeps only the most recent trading day", () => {
    const bars = [
      bar("2026-06-23T13:30:00Z", 1, 1, 1, 10),
      bar("2026-06-23T20:00:00Z", 1, 1, 1, 11),
      bar("2026-06-24T13:30:00Z", 1, 1, 1, 12),
      bar("2026-06-24T20:00:00Z", 1, 1, 1, 13),
    ];
    const out = latestSessionOnly(bars);
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.t.startsWith("2026-06-24"))).toBe(true);
  });

  it("returns [] unchanged when empty", () => {
    expect(latestSessionOnly([])).toEqual([]);
  });
});

describe("week52Range", () => {
  it("takes the high of highs and low of lows", () => {
    const bars = [
      bar("2025-07-01T00:00:00Z", 10, 12, 9, 11),
      bar("2025-12-01T00:00:00Z", 11, 20, 8, 15),
      bar("2026-06-01T00:00:00Z", 15, 17, 14, 16),
    ];
    expect(week52Range(bars)).toEqual({ high: 20, low: 8 });
  });

  it("is null/null with no data", () => {
    expect(week52Range([])).toEqual({ high: null, low: null });
  });
});

describe("mapSnapshotToQuote", () => {
  const snap: AlpacaSnapshot = {
    latestTrade: { p: 105, t: "2026-06-24T19:59:00Z" },
    dailyBar: { o: 100, h: 107, l: 99, c: 104, v: 5_000_000 },
    prevDailyBar: { o: 96, h: 101, l: 95, c: 100, v: 4_000_000 },
    minuteBar: null,
  };

  it("derives change vs the prior close and prefers the latest trade for price", () => {
    const q = mapSnapshotToQuote("NVDA", snap, { high: 140, low: 70 });
    expect(q.price).toBe(105);
    expect(q.prevClose).toBe(100);
    expect(q.change).toBe(5);
    expect(q.changePct).toBeCloseTo(0.05);
    expect(q.open).toBe(100);
    expect(q.week52High).toBe(140);
  });

  it("falls back to the daily close when there is no latest trade", () => {
    const q = mapSnapshotToQuote(
      "NVDA",
      { ...snap, latestTrade: null },
      { high: null, low: null },
    );
    expect(q.price).toBe(104);
    expect(q.change).toBe(4);
  });
});

describe("quoteFromDailyBars", () => {
  it("uses the last bar as today and the prior bar as prev close", () => {
    const bars = [
      bar("2026-06-22T00:00:00Z", 10, 11, 9, 10),
      bar("2026-06-23T00:00:00Z", 10, 12, 10, 11),
      bar("2026-06-24T00:00:00Z", 11, 13, 11, 12),
    ];
    const q = quoteFromDailyBars("AMD", bars, { high: 13, low: 9 });
    expect(q?.price).toBe(12);
    expect(q?.prevClose).toBe(11);
    expect(q?.change).toBe(1);
  });

  it("is null with no bars", () => {
    expect(quoteFromDailyBars("AMD", [], { high: null, low: null })).toBeNull();
  });
});

describe("mapNews", () => {
  it("maps Alpaca news into the view contract and drops untitled items", () => {
    const out = mapNews([
      {
        id: "1",
        headline: "Chipmaker beats on earnings",
        source: "Benzinga",
        url: "https://example.com/a",
        created_at: "2026-06-24T12:00:00Z",
      },
      {
        id: "2",
        headline: "",
        source: "X",
        url: "https://example.com/b",
        created_at: "2026-06-24T12:00:00Z",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Chipmaker beats on earnings");
    expect(out[0].url).toBe("https://example.com/a");
  });
});
