import { describe, expect, it } from "vitest";
import { getGoNoGo, resolveGoNoGoConfig } from "./go-no-go";
import type { JournalEntry, PortfolioSnapshot } from "@/lib/types";

describe("resolveGoNoGoConfig", () => {
  it("defaults to ≥3 months, ≥20 trades, >0 margin, SPY-relative drawdown", () => {
    const c = resolveGoNoGoConfig({});
    expect(c.minMonths).toBe(3);
    expect(c.minClosedTrades).toBe(20);
    expect(c.minNetExcessAnnualizedPct).toBe(0);
    expect(c.maxDrawdownCapPct).toBeNull();
  });

  it("reads tuned thresholds and normalizes the drawdown cap to a negative fraction", () => {
    const c = resolveGoNoGoConfig({
      EVAL_MIN_MONTHS: "6",
      EVAL_MIN_CLOSED_TRADES: "40",
      EVAL_MIN_NET_EXCESS_ANNUALIZED_PCT: "0.02",
      EVAL_MAX_DRAWDOWN_CAP_PCT: "0.15", // given positive → stored as −0.15
    });
    expect(c.minMonths).toBe(6);
    expect(c.minClosedTrades).toBe(40);
    expect(c.minNetExcessAnnualizedPct).toBe(0.02);
    expect(c.maxDrawdownCapPct).toBe(-0.15);
  });
});

describe("getGoNoGo", () => {
  const emptySnapshot: PortfolioSnapshot = {
    account: "paper",
    asOf: "2026-02-01T16:00:00-05:00",
    currency: "USD",
    equity: 1_000,
    cash: 1_000,
    buyingPower: 1_000,
    totalPl: 0,
    totalPlPct: 0,
    dayPl: 0,
    dayPlPct: 0,
    positions: [],
    equityCurve: [
      { date: "2026-01-01", equity: 1_000 },
      { date: "2026-01-15", equity: 1_010 },
    ],
  } as unknown as PortfolioSnapshot;

  it("is NOT-YET with a short window and no closed trades", async () => {
    const r = await getGoNoGo({
      readLatestSnapshotImpl: async () => emptySnapshot,
      readJournalImpl: async () => [],
      readDiagnosticsImpl: async () => [],
      fetchCloses: async () => [],
    });
    expect(r.verdict).toBe("NOT-YET");
    expect(r.sample.closedTrades).toBe(0);
    expect(r.sample.minClosedTrades).toBe(20);
  });

  it("counts only paper closed round-trips toward the sample gate", async () => {
    const roundTrips: JournalEntry[] = [
      {
        kind: "trade",
        id: "b",
        account: "paper",
        timestamp: "2026-01-02T10:00:00-05:00",
        symbol: "MSFT",
        action: "buy",
        side: "long",
        qty: 1,
        price: 100,
        stopPrice: 90,
        tags: [],
      },
      {
        kind: "trade",
        id: "s",
        account: "paper",
        timestamp: "2026-01-10T10:00:00-05:00",
        symbol: "MSFT",
        action: "sell",
        side: "long",
        qty: 1,
        price: 110,
        tags: [],
      },
      // a live round-trip that must NOT count toward the paper sample
      {
        kind: "trade",
        id: "lb",
        account: "live",
        timestamp: "2026-01-03T10:00:00-05:00",
        symbol: "NVDA",
        action: "buy",
        side: "long",
        qty: 1,
        price: 100,
        stopPrice: 90,
        tags: [],
      },
      {
        kind: "trade",
        id: "ls",
        account: "live",
        timestamp: "2026-01-11T10:00:00-05:00",
        symbol: "NVDA",
        action: "sell",
        side: "long",
        qty: 1,
        price: 120,
        tags: [],
      },
    ] as unknown as JournalEntry[];

    const r = await getGoNoGo({
      readLatestSnapshotImpl: async () => emptySnapshot,
      readJournalImpl: async () => roundTrips,
      readDiagnosticsImpl: async () => [],
      fetchCloses: async () => [],
    });
    expect(r.sample.closedTrades).toBe(1); // only the paper round-trip
  });
});
