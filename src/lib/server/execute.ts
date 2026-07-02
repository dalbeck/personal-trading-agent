import "server-only";

import { evaluateOrder, type ProposedOrder, type RiskContext } from "@/lib/risk";
import { railsForSleeve, sleeveRequiresStop } from "@strategy/sleeves.config";
import { sleeveOf } from "@/lib/sleeves";
import type {
  PortfolioSnapshot,
  RedTeamVerdict,
  TradeProposal,
} from "@/lib/types";
import { readLatestSnapshot, readProposals } from "./data";
import { incrementOrdersToday, readOrdersToday } from "./order-counter";
import {
  redTeamOutcome,
  runRedTeam,
  type RedTeamExec,
} from "./red-team";
import { toRedTeamProposal } from "./red-team-briefing";
import {
  recordRejection,
  recordRiskRejection,
  recordTradeDecision,
} from "./writers";

/**
 * The code-enforced execution pipeline (Phase 2 M5). Every proposal passes the
 * **risk engine** (M2) and the **cross-model red-team** (M4) — in this order,
 * in code — before the broker is ever called. A block at either gate is
 * journaled as a rejection; a placed order is journaled as a trade. The broker
 * call and the red-team spawn are injected so the whole pipeline is testable
 * without a network or the CLI.
 *
 * No real-money path here: `placeOrder` targets Alpaca **paper** only.
 */

export interface ExecutableProposal {
  symbol: string;
  action: "buy" | "sell";
  side: "long" | "short";
  /** Which mandate to brief the red-team under (value-sleeve M1); absent → the
   *  trend lens. The paper batch is trend-only today, but carry it through so a
   *  value proposal is judged by the matching lens. */
  strategy?: "trend" | "value";
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  riskPct: number | null;
  reviewDate: string;
  thesis: string;
  reasoning?: string;
  research?: string;
  tags?: string[];
  /** GICS sector for the concentration rail; null/absent when unknown. */
  sector?: string | null;
  /** How the profit target is anchored (M3); the red-team flags a weak one. */
  targetType?: string | null;
  /** Relative volume = entry-day volume ÷ trailing average (M2); a soft signal
   *  the red-team weighs. */
  relativeVolume?: number | null;
  /** The named catalyst — why *now* (M3); a `none`/missing one is flagged weak. */
  catalyst?: string | null;
  catalystType?: string | null;
}

export type PlaceOrder = (
  order: ProposedOrder,
) => Promise<{ brokerOrderId: string }>;

export interface ExecuteOpts {
  placeOrder: PlaceOrder;
  exec?: RedTeamExec;
  dataDir?: string;
  timestamp: string;
}

export type ExecutionOutcome =
  | "placed"
  | "downsized"
  | "rejected-risk"
  | "rejected-redteam";

export interface ExecutionResult {
  symbol: string;
  outcome: ExecutionOutcome;
  journalId: string;
  verdict?: RedTeamVerdict;
}

function toOrder(p: ExecutableProposal, qty: number): ProposedOrder {
  return {
    symbol: p.symbol,
    action: p.action,
    side: p.side,
    qty,
    limitPrice: p.limitPrice,
    orderType: "marketable_limit",
    stopPrice: p.stopPrice,
    assetClass: "equity",
    // Winner-exit + concentration rails read these; a proposal without a profit
    // target now fails the winner-exit rail in code.
    takeProfit: p.takeProfit,
    sector: p.sector ?? null,
    // Per-sleeve rails (per-sleeve-rails M2). The paper batch is swing today, so
    // this is `true` (unchanged); a no-stop sleeve would use its review trigger.
    requiresStop: sleeveRequiresStop(sleeveOf(p)),
  };
}

/** The rail block for a proposal's sleeve (per-sleeve-rails M2). Swing → the
 *  unchanged RISK_LIMITS. */
const limitsFor = (p: ExecutableProposal) => railsForSleeve(sleeveOf(p));

/** Run one proposal through both hard gates and journal the outcome. */
export async function executeProposal(
  proposal: ExecutableProposal,
  context: RiskContext,
  opts: ExecuteOpts,
): Promise<ExecutionResult> {
  const journalMeta = {
    timestamp: opts.timestamp,
    symbol: proposal.symbol,
    reviewDate: proposal.reviewDate,
    tags: proposal.tags,
    thesis: proposal.thesis,
    research: proposal.research,
  };

  // 1. Risk gate — in code, before anything else.
  const risk = evaluateOrder(
    toOrder(proposal, proposal.qty),
    context,
    limitsFor(proposal),
  );
  if (!risk.ok) {
    const { id } = await recordRiskRejection(
      { ...journalMeta, proposedAction: proposal.action },
      risk,
      { dataDir: opts.dataDir },
    );
    return { symbol: proposal.symbol, outcome: "rejected-risk", journalId: id };
  }

  // 2. Red-team gate — cross-model prosecutor, fails closed. One shared briefing
  // mapper (H3) so the paper batch judges a value/core proposal under its own
  // lens with the full value briefing, not the trend lens.
  const verdict = await runRedTeam(toRedTeamProposal(proposal), {
    exec: opts.exec,
  });
  const gate = redTeamOutcome(verdict);
  if (gate === "block") {
    const { id } = await recordRejection(
      {
        ...journalMeta,
        proposedAction: proposal.action,
        rejectedBy: "codex-redteam",
        redTeam: verdict.notes,
        reason: verdict.notes,
      },
      { dataDir: opts.dataDir },
    );
    return {
      symbol: proposal.symbol,
      outcome: "rejected-redteam",
      journalId: id,
      verdict,
    };
  }

  // 3. Downsize on a concern — halve and re-check the risk gate.
  let qty = proposal.qty;
  let downsized = false;
  if (gate === "downsize") {
    qty = Math.floor(proposal.qty / 2);
    const recheck = evaluateOrder(
      toOrder(proposal, qty),
      context,
      limitsFor(proposal),
    );
    if (qty < 1 || !recheck.ok) {
      const { id } = await recordRiskRejection(
        { ...journalMeta, proposedAction: proposal.action },
        recheck,
        { dataDir: opts.dataDir },
      );
      return {
        symbol: proposal.symbol,
        outcome: "rejected-risk",
        journalId: id,
        verdict,
      };
    }
    downsized = true;
  }

  // 4. Place the paper order and journal the trade.
  const placed = await opts.placeOrder(toOrder(proposal, qty));
  const { id } = await recordTradeDecision(
    {
      timestamp: opts.timestamp,
      symbol: proposal.symbol,
      action: proposal.action,
      side: proposal.side,
      qty,
      price: proposal.limitPrice,
      stopPrice: proposal.stopPrice,
      takeProfit: proposal.takeProfit,
      riskPct: proposal.riskPct,
      reviewDate: proposal.reviewDate,
      tags: proposal.tags,
      thesis: proposal.thesis,
      research: proposal.research,
      redTeam: verdict.notes,
      decision: `Placed paper order ${placed.brokerOrderId}${
        downsized ? " (downsized on red-team concern)" : ""
      }.`,
    },
    { dataDir: opts.dataDir },
  );

  return {
    symbol: proposal.symbol,
    outcome: downsized ? "downsized" : "placed",
    journalId: id,
    verdict,
  };
}

export interface RunSummary {
  considered: number;
  placed: number;
  rejected: number;
  results: ExecutionResult[];
}

function highWater(snapshot: PortfolioSnapshot): number {
  const curve = snapshot.equityCurve.map((p) => p.equity);
  return Math.max(snapshot.equity, ...curve, 0);
}

function reviewDateFrom(proposal: TradeProposal, fallback: string): string {
  return proposal.reviewByDate ?? fallback;
}

/**
 * The market-open execution step: run every pending proposal through the gates,
 * threading risk context (open positions, orders placed) across the batch so
 * the position-count and daily-order caps are respected within the run.
 */
export async function executePendingProposals(opts: {
  placeOrder: PlaceOrder;
  exec?: RedTeamExec;
  dataDir?: string;
  timestamp: string;
  market?: { spyIntradayChangePct?: number; vix?: number };
  proposals?: TradeProposal[];
  snapshot?: PortfolioSnapshot | null;
}): Promise<RunSummary> {
  // The autonomous batch is **paper-only**: it must never auto-place a
  // live-intent order. Live proposals — approvable (`advisory: false`) or manual
  // guidance (`advisory: true`) — are handled exclusively by the per-trade human
  // approval path (`submitTradeApproval`), so the agent places nothing live on
  // its own. Skip anything not a plain paper proposal here.
  const all = opts.proposals ?? (await readProposals({ pendingOnly: true }));
  const proposals = all.filter((p) => p.account !== "live" && !p.advisory);
  const snapshot = opts.snapshot ?? (await readLatestSnapshot("paper"));
  const results: ExecutionResult[] = [];

  if (!snapshot) {
    return { considered: proposals.length, placed: 0, rejected: 0, results };
  }

  const openPositions = snapshot.positions.map((p) => ({
    symbol: p.symbol,
    marketValue: p.marketValue,
  }));
  // Seed from the persisted per-ET-day counter so the ≤6/day cap holds across
  // every run and every path (this batch + human approvals), not just within one
  // batch. The counter is incremented at each placement below.
  const counterNow = new Date(opts.timestamp);
  let ordersToday = await readOrdersToday({
    dataDir: opts.dataDir,
    now: counterNow,
  });
  const fallbackReview = opts.timestamp.slice(0, 10);

  for (const p of proposals) {
    const context: RiskContext = {
      equity: snapshot.equity,
      highWaterEquity: highWater(snapshot),
      openPositions: [...openPositions],
      ordersToday,
      spyIntradayChangePct: opts.market?.spyIntradayChangePct ?? 0,
      vix: opts.market?.vix ?? 15,
    };

    const result = await executeProposal(
      {
        symbol: p.symbol,
        action: p.action,
        side: p.side,
        qty: p.qty,
        limitPrice: p.limitPrice,
        stopPrice: p.stopPrice,
        takeProfit: p.takeProfit,
        riskPct: p.riskPct,
        reviewDate: reviewDateFrom(p, fallbackReview),
        thesis: p.thesis,
        reasoning: p.reasoning,
        sector: p.sector,
        targetType: p.targetType,
      },
      context,
      {
        placeOrder: opts.placeOrder,
        exec: opts.exec,
        dataDir: opts.dataDir,
        timestamp: opts.timestamp,
      },
    );
    results.push(result);

    if (result.outcome === "placed" || result.outcome === "downsized") {
      ordersToday += 1;
      await incrementOrdersToday({
        dataDir: opts.dataDir,
        now: counterNow,
      }).catch(() => {});
      if (!openPositions.some((o) => o.symbol === p.symbol)) {
        openPositions.push({
          symbol: p.symbol,
          marketValue: p.qty * p.limitPrice,
        });
      }
    }
  }

  const placed = results.filter(
    (r) => r.outcome === "placed" || r.outcome === "downsized",
  ).length;
  return {
    considered: proposals.length,
    placed,
    rejected: results.length - placed,
    results,
  };
}
