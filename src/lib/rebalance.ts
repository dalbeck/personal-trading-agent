/**
 * Rebalancing trade generation (portfolio M5) — pure. Given the per-sleeve drift
 * vs the human's target allocation and the current holdings (attributed to
 * sleeves), it proposes concrete **trim** (sell) and **add** (buy) trades to pull
 * each sleeve back toward its target:
 *
 * - An **overweight** sleeve is trimmed by selling its holdings (largest first)
 *   down by the excess dollars — concrete, since we hold the names.
 * - An **underweight** sleeve that **already holds** something is topped up by
 *   buying more of its largest holding, **scaled in over tranches** (the
 *   staged-entry machinery) so it's gated tranche-by-tranche.
 * - An underweight sleeve that holds **nothing** can't form a concrete buy (which
 *   name is a discovery decision), so it surfaces as a **gap** for the human /
 *   the sleeve-aware discovery run, never a fabricated order.
 *
 * Nothing here places an order — these are drafts the human queues into the normal
 * gated approval path. Dust trades below `minTradeUsd` are skipped.
 */
import { buildStagedEntryPlan } from "@/lib/staged-entry";
import type { StagedEntryPlan } from "@/lib/types";
import type { SleeveDrift } from "@/lib/portfolio";
import type { Sleeve } from "@/lib/sleeves";

export interface RebalanceHolding {
  symbol: string;
  marketValue: number;
  qty: number;
  lastPrice: number;
}

export interface RebalanceTrade {
  sleeve: Sleeve;
  symbol: string;
  action: "buy" | "sell";
  qty: number;
  estUsd: number;
  reason: string;
  /** Scale-in plan for an add (buy); null for a trim (sell) — a trim is one exit. */
  stagedPlan: StagedEntryPlan | null;
}

/** An underweight sleeve with no holding to add to — needs a candidate (discovery). */
export interface RebalanceGap {
  sleeve: Sleeve;
  deficitUsd: number;
}

export interface RebalanceResult {
  trades: RebalanceTrade[];
  gaps: RebalanceGap[];
}

export interface BuildRebalanceInput {
  drift: readonly SleeveDrift[];
  holdingsBySleeve: ReadonlyMap<Sleeve, readonly RebalanceHolding[]>;
  equity: number;
  /** Skip trades smaller than this (avoid dust). Default $25. */
  minTradeUsd?: number;
  /** Tranche count for scaling into an add. Default 3. */
  addTrancheCount?: number;
  allowFractional?: boolean;
}

const floorQty = (raw: number, frac: boolean): number =>
  frac ? Math.floor(raw * 1e4) / 1e4 : Math.floor(raw);

export function buildRebalanceTrades(input: BuildRebalanceInput): RebalanceResult {
  const minTradeUsd = input.minTradeUsd ?? 25;
  const allowFractional = input.allowFractional ?? true;
  const trades: RebalanceTrade[] = [];
  const gaps: RebalanceGap[] = [];

  for (const d of input.drift) {
    if (!d.pastBand) continue;
    const holdings = [...(input.holdingsBySleeve.get(d.sleeve) ?? [])].sort(
      (a, b) => b.marketValue - a.marketValue,
    );

    if (d.status === "over") {
      // Trim: sell holdings largest-first to remove the excess dollars.
      let excessUsd = d.driftPct * input.equity; // positive
      for (const h of holdings) {
        if (excessUsd < minTradeUsd) break;
        if (!(h.lastPrice > 0)) continue;
        const sellUsd = Math.min(h.marketValue, excessUsd);
        const qty = floorQty(sellUsd / h.lastPrice, allowFractional);
        if (!(qty > 0)) continue;
        const estUsd = qty * h.lastPrice;
        if (estUsd < minTradeUsd) continue;
        trades.push({
          sleeve: d.sleeve,
          symbol: h.symbol,
          action: "sell",
          qty,
          estUsd,
          reason: `Trim overweight ${d.sleeve} (${(d.driftPct * 100).toFixed(0)}% over target)`,
          stagedPlan: null,
        });
        excessUsd -= estUsd;
      }
    } else if (d.status === "under") {
      const deficitUsd = -d.driftPct * input.equity; // positive
      if (deficitUsd < minTradeUsd) continue;
      if (holdings.length === 0) {
        // No name to add to — a discovery gap, not a fabricated order.
        gaps.push({ sleeve: d.sleeve, deficitUsd });
        continue;
      }
      // Add to the largest existing holding, scaled in over tranches.
      const h = holdings[0];
      if (!(h.lastPrice > 0)) {
        gaps.push({ sleeve: d.sleeve, deficitUsd });
        continue;
      }
      const qty = floorQty(deficitUsd / h.lastPrice, allowFractional);
      if (!(qty > 0)) continue;
      const stagedPlan = buildStagedEntryPlan({
        fullQty: qty,
        trancheCount: input.addTrancheCount ?? 3,
        allowFractional,
      });
      trades.push({
        sleeve: d.sleeve,
        symbol: h.symbol,
        action: "buy",
        qty,
        estUsd: qty * h.lastPrice,
        reason: `Add to underweight ${d.sleeve} (${(-d.driftPct * 100).toFixed(0)}% under target)`,
        stagedPlan,
      });
    }
  }

  return { trades, gaps };
}
