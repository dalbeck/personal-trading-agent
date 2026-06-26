import { describe, expect, it } from "vitest";
import { getEvaluationScorecard, getLiveBookPerformance } from "./eval";
import type { JournalEntry, PortfolioSnapshot } from "@/lib/types";

/**
 * The Phase 2 scorecard grades the PAPER proving-ground. Live activity — real
 * trades and the routinely-refreshed live snapshots (M2) — must not contaminate
 * it: a live trade can't inflate the paper trade stats, and the presence of a
 * read-only live snapshot must not trip the "real-money path touched" integrity
 * flag (that would falsely fail the paper gate now that the desk is live-first).
 */

const paperSnapshot: PortfolioSnapshot = {
  account: "paper",
  asOf: "2026-06-25T16:00:00-04:00",
  currency: "USD",
  equity: 101_000,
  cash: 50_000,
  buyingPower: 100_000,
  totalPl: 1_000,
  totalPlPct: 0.01,
  dayPl: 0,
  dayPlPct: 0,
  positions: [],
  equityCurve: [
    { date: "2026-06-24", equity: 100_000 },
    { date: "2026-06-25", equity: 101_000 },
  ],
} as unknown as PortfolioSnapshot;

const liveSnapshot: PortfolioSnapshot = {
  ...paperSnapshot,
  account: "live",
} as PortfolioSnapshot;

const paperTrade: JournalEntry = {
  kind: "trade",
  id: "j-paper",
  account: "paper",
  timestamp: "2026-06-24T09:41:00-04:00",
  symbol: "MSFT",
  action: "buy",
  side: "long",
  qty: 10,
  price: 100,
  stopPrice: 90,
  tags: [],
} as unknown as JournalEntry;

const liveTrade: JournalEntry = {
  kind: "trade",
  id: "j-live",
  account: "live",
  timestamp: "2026-06-24T10:00:00-04:00",
  symbol: "NVDA",
  action: "buy",
  side: "long",
  qty: 1,
  price: 150,
  stopPrice: null, // a live buy with no stop must NOT count against paper integrity
  tags: [],
} as unknown as JournalEntry;

describe("getEvaluationScorecard paper scoping", () => {
  it("excludes live trades and live snapshots from the paper scorecard", async () => {
    const card = await getEvaluationScorecard({
      fetchCloses: async () => [],
      readLatestSnapshotImpl: async () => paperSnapshot,
      readSnapshotsImpl: async () => [paperSnapshot, liveSnapshot],
      readJournalImpl: async () => [paperTrade, liveTrade],
      readProposalsImpl: async () => [],
      readRunLogsImpl: async () => [],
    });

    // Only the one PAPER trade is counted, not the live one.
    expect(card.trades.ordersExecuted).toBe(1);
    // A live snapshot in the set must not flag the paper book's integrity, and a
    // live buy without a stop must not count as a paper stop violation.
    expect(card.integrity.realMoneyPathTouched).toBe(false);
    expect(card.integrity.ordersWithoutStop).toBe(0);
  });
});

describe("getLiveBookPerformance", () => {
  const liveSell: JournalEntry = {
    kind: "trade",
    id: "j-live-sell",
    account: "live",
    timestamp: "2026-06-25T12:35:00-04:00",
    symbol: "NVDA",
    action: "sell",
    side: "long",
    qty: 1,
    price: 170,
    tags: [],
  } as unknown as JournalEntry;

  it("returns null when there is no live snapshot", async () => {
    const perf = await getLiveBookPerformance({
      readLatestSnapshotImpl: async () => null,
      readJournalImpl: async () => [liveSell],
    });
    expect(perf).toBeNull();
  });

  it("counts only LIVE sell trades as exits taken", async () => {
    const perf = await getLiveBookPerformance({
      readLatestSnapshotImpl: async () => liveSnapshot,
      readJournalImpl: async () => [
        liveSell,
        { ...liveSell, id: "p", account: "paper" } as JournalEntry, // paper sell — excluded
        paperTrade, // paper buy — excluded
      ],
    });
    expect(perf?.exitsTaken).toBe(1);
  });
});
