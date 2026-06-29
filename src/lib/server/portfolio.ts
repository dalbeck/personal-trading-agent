import "server-only";

import { readJournal, readLatestSnapshot } from "./data";
import { getViewMode } from "./mode";
import { readAllocationTargets } from "./allocation-targets";
import {
  attributeSleeve,
  buildSleevePerformance,
  computeDrift,
  computeSleeveWeights,
  type AttributionEntry,
  type PerfPosition,
  type SleeveDrift,
  type SleevePerformance,
  type SleeveWeight,
} from "@/lib/portfolio";
import { buildRebalanceTrades, type RebalanceResult, type RebalanceHolding } from "@/lib/rebalance";
import type { Sleeve } from "@/lib/sleeves";
import type { AllocationTargets } from "@/lib/types";

/**
 * Assemble the portfolio overview (portfolio M5) for the **active book** (the
 * view mode). Reads the latest snapshot + the trade journal + the human's
 * allocation targets, attributes each holding to a sleeve from the journal tags,
 * and computes per-sleeve weights, drift vs the targets, per-sleeve + blended
 * performance, and the suggested rebalancing trades. All read-only — it places
 * nothing and never edits the targets.
 */
export interface PortfolioOverview {
  mode: "paper" | "live";
  asOf: string | null;
  equityUsd: number;
  cashUsd: number;
  weights: SleeveWeight[];
  drift: SleeveDrift[];
  perf: SleevePerformance[];
  rebalance: RebalanceResult;
  targets: AllocationTargets;
  blended: {
    benchmark: string;
    marketValueUsd: number;
    costBasisUsd: number;
    unrealizedPlUsd: number;
    unrealizedPlPct: number | null;
    /** Whole-book vs benchmark return from the snapshot, when present. */
    benchmarkReturn:
      | { symbol: string; portfolioReturnPct: number; benchmarkReturnPct: number }
      | null;
  };
}

export async function getPortfolioOverview(opts?: {
  mode?: "paper" | "live";
}): Promise<PortfolioOverview> {
  const mode = opts?.mode ?? (await getViewMode());
  const [snapshot, journal, targets] = await Promise.all([
    readLatestSnapshot(mode),
    readJournal(),
    readAllocationTargets(),
  ]);

  const equityUsd = snapshot?.equity ?? 0;
  const positions = snapshot?.positions ?? [];

  // Attribution journal — the active book's tagged buys/sells only (no bleed).
  const attribJournal: AttributionEntry[] = journal
    .filter((e) => e.account === mode && e.kind === "trade")
    .map((e) => ({
      symbol: e.symbol,
      timestamp: e.timestamp,
      action: (e as { action: "buy" | "sell" }).action,
      tags: e.tags,
    }));

  const weights = computeSleeveWeights(positions, attribJournal, equityUsd);
  const investedUsd = positions.reduce((s, p) => s + p.marketValue, 0);
  const cashUsd = equityUsd - investedUsd;
  const drift = computeDrift(weights, targets.targets, targets.driftBandPct);

  const perfPositions: PerfPosition[] = positions.map((p) => ({
    symbol: p.symbol,
    marketValue: p.marketValue,
    costBasis: p.costBasis,
    unrealizedPl: p.unrealizedPl,
  }));
  const perf = buildSleevePerformance(perfPositions, attribJournal);

  // Holdings grouped by attributed sleeve for the rebalance generator.
  const holdingsBySleeve = new Map<Sleeve, RebalanceHolding[]>();
  for (const p of positions) {
    const sleeve = attributeSleeve(p.symbol, attribJournal);
    if (sleeve === "unattributed") continue;
    const list = holdingsBySleeve.get(sleeve) ?? [];
    list.push({
      symbol: p.symbol,
      marketValue: p.marketValue,
      qty: p.qty,
      lastPrice: p.lastPrice,
    });
    holdingsBySleeve.set(sleeve, list);
  }
  const rebalance = buildRebalanceTrades({
    drift,
    holdingsBySleeve,
    equity: equityUsd,
  });

  const costBasisUsd = positions.reduce((s, p) => s + p.costBasis, 0);
  const unrealizedPlUsd = positions.reduce((s, p) => s + p.unrealizedPl, 0);

  return {
    mode,
    asOf: snapshot?.asOf ?? null,
    equityUsd,
    cashUsd,
    weights,
    drift,
    perf,
    rebalance,
    targets,
    blended: {
      benchmark: targets.blendedBenchmark,
      marketValueUsd: investedUsd,
      costBasisUsd,
      unrealizedPlUsd,
      unrealizedPlPct: costBasisUsd === 0 ? null : unrealizedPlUsd / costBasisUsd,
      benchmarkReturn: snapshot?.benchmark
        ? {
            symbol: snapshot.benchmark.symbol,
            portfolioReturnPct: snapshot.benchmark.portfolioReturnPct,
            benchmarkReturnPct: snapshot.benchmark.benchmarkReturnPct,
          }
        : null,
    },
  };
}
