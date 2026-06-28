import { describe, expect, it } from "vitest";
import { getCostModel, resolveCostConfig } from "./cost";
import type { JournalEntry, PortfolioSnapshot } from "@/lib/types";
import type { ResearchDiagnostic } from "./research/diagnostics";

const paperSnapshot: PortfolioSnapshot = {
  account: "paper",
  asOf: "2026-04-01T16:00:00-04:00",
  currency: "USD",
  equity: 1_000,
  cash: 500,
  buyingPower: 1_000,
  totalPl: 0,
  totalPlPct: 0,
  dayPl: 0,
  dayPlPct: 0,
  positions: [],
  equityCurve: [
    { date: "2026-01-01", equity: 1_000 },
    { date: "2026-04-01", equity: 1_100 },
  ],
} as unknown as PortfolioSnapshot;

const paperBuy: JournalEntry = {
  kind: "trade",
  id: "j-paper",
  account: "paper",
  timestamp: "2026-02-01T09:41:00-04:00",
  symbol: "MSFT",
  action: "buy",
  side: "long",
  qty: 10,
  price: 100, // notional 1000
  stopPrice: 90,
  tags: [],
} as unknown as JournalEntry;

const liveBuy: JournalEntry = {
  ...paperBuy,
  id: "j-live",
  account: "live",
} as JournalEntry;

const diag = (over: Partial<ResearchDiagnostic>): ResearchDiagnostic => ({
  at: "2026-02-15T10:00:00Z",
  provider: "perplexity",
  symbol: "MSFT",
  outcome: "ok",
  latencyMs: 100,
  ...over,
});

describe("resolveCostConfig", () => {
  it("defaults to the free tier with no env set", () => {
    const c = resolveCostConfig({});
    expect(c.fixedApiAnnualUsd).toBe(0);
    expect(c.slippageBpsPerSide).toBe(5);
    expect(c.commissionPerTradeUsd).toBe(0);
  });

  it("reads the configured annual FMP cost, slippage bps, and commission", () => {
    const c = resolveCostConfig({
      EVAL_FIXED_API_COST_ANNUAL_USD: "228",
      EVAL_SLIPPAGE_BPS: "8",
      EVAL_COMMISSION_PER_TRADE_USD: "0.65",
    });
    expect(c.fixedApiAnnualUsd).toBe(228);
    expect(c.slippageBpsPerSide).toBe(8);
    expect(c.commissionPerTradeUsd).toBe(0.65);
  });

  it("falls back to defaults on a malformed or negative value", () => {
    const c = resolveCostConfig({
      EVAL_FIXED_API_COST_ANNUAL_USD: "not-a-number",
      EVAL_SLIPPAGE_BPS: "-3",
    });
    expect(c.fixedApiAnnualUsd).toBe(0);
    expect(c.slippageBpsPerSide).toBe(5);
  });
});

describe("getCostModel", () => {
  it("assembles an itemized model over the paper window from diagnostics + fills", async () => {
    const model = await getCostModel({
      config: {
        fixedApiAnnualUsd: 228,
        slippageBpsPerSide: 5,
        commissionPerTradeUsd: 0,
      },
      readLatestSnapshotImpl: async () => paperSnapshot,
      readJournalImpl: async () => [paperBuy, liveBuy],
      readDiagnosticsImpl: async () => [
        diag({ at: "2026-02-15T10:00:00Z", cost: 0.008 }),
        diag({ at: "2026-03-20T10:00:00Z", cost: 0.009 }),
        diag({ at: "2025-12-01T10:00:00Z", cost: 5 }), // before window → excluded
        diag({ provider: "fmp", outcome: "ok", cost: undefined }), // free, no cost
      ],
    });

    expect(model.windowDays).toBe(90);
    expect(model.capitalBaseUsd).toBe(1_000);
    expect(model.lines.fixedApi.amountUsd).toBeCloseTo(56.2191, 3);
    expect(model.lines.meteredApi.amountUsd).toBeCloseTo(0.017, 6);
    // Only the PAPER buy's notional (1000) is modeled for slippage, not the live one.
    expect(model.lines.slippage.amountUsd).toBeCloseTo(0.5, 6);
    expect(model.fills).toBe(1);
  });

  it("returns a zero-cost free-tier model when there is no paper snapshot", async () => {
    const model = await getCostModel({
      readLatestSnapshotImpl: async () => null,
      readJournalImpl: async () => [],
      readDiagnosticsImpl: async () => [],
    });
    expect(model.totalUsd).toBe(0);
    expect(model.windowDays).toBe(0);
    expect(model.costDragPct).toBeNull();
  });
});
