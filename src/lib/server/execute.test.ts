import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RiskContext } from "@/lib/risk";
import type { PortfolioSnapshot, TradeProposal } from "@/lib/types";
import type { RedTeamExec } from "./red-team";
import { validateDataDir } from "./validate-data";
import {
  type ExecutableProposal,
  executePendingProposals,
  executeProposal,
} from "./execute";

const approve: RedTeamExec = async () =>
  '{"verdict":"approve","notes":"Survives the attack."}';
const reject: RedTeamExec = async () =>
  '{"verdict":"reject","notes":"Crowded; stop too wide."}';
const concern: RedTeamExec = async () =>
  '{"verdict":"concern","notes":"Trim size into the event."}';

function ctx(over: Partial<RiskContext> = {}): RiskContext {
  return {
    equity: 100_000,
    highWaterEquity: 100_000,
    openPositions: [],
    ordersToday: 0,
    spyIntradayChangePct: 0,
    vix: 15,
    ...over,
  };
}

function proposal(over: Partial<ExecutableProposal> = {}): ExecutableProposal {
  return {
    symbol: "NVDA",
    action: "buy",
    side: "long",
    qty: 100,
    limitPrice: 150,
    stopPrice: 147,
    takeProfit: 170,
    riskPct: 0.003,
    reviewDate: "2026-07-24",
    thesis: "Demand outrunning supply.",
    reasoning: "Breakout retest.",
    ...over,
  };
}

async function tmpData(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-exec-"));
}

describe("executeProposal", () => {
  it("places a clean proposal and journals the trade", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async () => ({ brokerOrderId: "ord-1" }));
    const res = await executeProposal(proposal(), ctx(), {
      exec: approve,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T09:41:00-04:00",
    });
    expect(res.outcome).toBe("placed");
    expect(placeOrder).toHaveBeenCalledOnce();
    expect(await validateDataDir(dir)).toEqual([]);
  });

  it("blocks on a risk violation before the broker is ever called", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async () => ({ brokerOrderId: "x" }));
    // 100 × $150 × 2 = $30k > 20% of $100k.
    const res = await executeProposal(proposal({ qty: 200 }), ctx(), {
      exec: approve,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T09:41:00-04:00",
    });
    expect(res.outcome).toBe("rejected-risk");
    expect(placeOrder).not.toHaveBeenCalled();
    expect(await validateDataDir(dir)).toEqual([]);
  });

  it("blocks when the red-team rejects, and the broker is never called", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async () => ({ brokerOrderId: "x" }));
    const res = await executeProposal(proposal(), ctx(), {
      exec: reject,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T09:41:00-04:00",
    });
    expect(res.outcome).toBe("rejected-redteam");
    expect(placeOrder).not.toHaveBeenCalled();
    expect(await validateDataDir(dir)).toEqual([]);
  });

  it("downsizes on a red-team concern and places the smaller order", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async (order) => ({
      brokerOrderId: `ord-${order.qty}`,
    }));
    const res = await executeProposal(proposal({ qty: 100 }), ctx(), {
      exec: concern,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T09:41:00-04:00",
    });
    expect(res.outcome).toBe("downsized");
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 50 }),
    );
  });
});

describe("executePendingProposals", () => {
  const snapshot = {
    account: "paper",
    asOf: "2026-06-24T09:30:00-04:00",
    currency: "USD",
    equity: 100_000,
    cash: 50_000,
    buyingPower: 100_000,
    totalPl: 0,
    totalPlPct: 0,
    dayPl: 0,
    dayPlPct: 0,
    positions: [],
    equityCurve: [],
  } as unknown as PortfolioSnapshot;

  const pending = [
    {
      id: "p-1",
      createdAt: "2026-06-24T08:05:00-04:00",
      symbol: "NVDA",
      action: "buy",
      side: "long",
      qty: 50,
      limitPrice: 150,
      stopPrice: 147,
      takeProfit: 170,
      riskPct: 0.0015,
      confidence: 0.6,
      thesis: "Clean trend.",
      reasoning: "Pullback.",
      status: "pending",
      redTeam: null,
      reviewByDate: "2026-07-24",
    },
    {
      id: "p-2",
      createdAt: "2026-06-24T08:06:00-04:00",
      symbol: "TSLA",
      action: "buy",
      side: "long",
      qty: 300, // oversize → risk block
      limitPrice: 150,
      stopPrice: 147,
      takeProfit: 170,
      riskPct: 0.001,
      confidence: 0.5,
      thesis: "Momentum.",
      reasoning: "Event.",
      status: "pending",
      redTeam: null,
      reviewByDate: "2026-07-24",
    },
  ] as unknown as TradeProposal[];

  it("runs each pending proposal through the gates and tallies the run", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async () => ({ brokerOrderId: "ord" }));
    const summary = await executePendingProposals({
      exec: approve,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T09:35:00-04:00",
      proposals: pending,
      snapshot,
    });
    expect(summary.considered).toBe(2);
    expect(summary.placed).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(placeOrder).toHaveBeenCalledOnce();
    // Two journal entries written (one trade, one rejection).
    expect(await validateDataDir(dir)).toEqual([]);
    const journals = await readdir(path.join(dir, "decision-journal"));
    expect(journals).toHaveLength(2);
  });

  it("NEVER auto-executes a live proposal — the autonomous paper batch is paper-only", async () => {
    const dir = await tmpData();
    const placeOrder = vi.fn(async () => ({ brokerOrderId: "ord" }));
    const liveSell = {
      id: "live-1",
      createdAt: "2026-06-24T12:35:00-04:00",
      symbol: "NVDA",
      action: "sell",
      side: "long",
      qty: 10,
      limitPrice: 150,
      stopPrice: null,
      takeProfit: null,
      riskPct: 0,
      confidence: null,
      thesis: "Hit take-profit; bank the gain.",
      reasoning: "Approaching target.",
      status: "pending",
      account: "live",
      advisory: false,
      redTeam: null,
      reviewByDate: "2026-07-24",
    } as unknown as TradeProposal;
    const liveAdvisory = { ...liveSell, id: "live-2", advisory: true } as TradeProposal;

    const summary = await executePendingProposals({
      exec: approve,
      placeOrder,
      dataDir: dir,
      timestamp: "2026-06-24T12:35:00-04:00",
      // A paper buy alongside live (approvable + advisory) proposals.
      proposals: [pending[0], liveSell, liveAdvisory],
      snapshot,
    });

    // Only the paper proposal is considered/placed; the live ones never reach
    // the broker — live execution is human-approved per trade, never the batch.
    expect(summary.considered).toBe(1);
    expect(summary.placed).toBe(1);
    expect(placeOrder).toHaveBeenCalledOnce();
    expect(placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "NVDA", action: "buy" }),
    );
    const journals = await readdir(path.join(dir, "decision-journal"));
    expect(journals).toHaveLength(1);
  });
});
