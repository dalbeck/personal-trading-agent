import "server-only";

import {
  buildCostModel,
  DEFAULT_COST_CONFIG,
  fillsFromExecutedTrades,
  type CostConfig,
  type CostModel,
  type MeteredCall,
} from "@/lib/eval/cost-model";
import { readJournal, readLatestSnapshot } from "./data";
import {
  readResearchDiagnostics,
  type ResearchDiagnostic,
} from "./research/diagnostics";

/**
 * Server-only assembler for the cost model (cost-aware-scorecard M1). Reads the
 * paper window (latest paper snapshot's equity curve), the paper trade fills
 * (decision journal), and the **real** metered per-call costs
 * (`data/research/diagnostics.json`), then feeds the pure `buildCostModel`.
 *
 * **Paper-scoped** like the rest of the evaluation surface (no paper/live bleed):
 * the proving-ground's run-cost is what the go/no-go decision weighs. The
 * diagnostics ring is global (not account-tagged) — it is the real research bill
 * either book incurred — and is filtered to the window inside `buildCostModel`.
 */

/** Resolve the cost config from the environment (all default to the free tier). */
export function resolveCostConfig(
  env: Record<string, string | undefined> = process.env,
): CostConfig {
  const num = (raw: string | undefined, fallback: number): number => {
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    fixedApiAnnualUsd: num(
      env.EVAL_FIXED_API_COST_ANNUAL_USD,
      DEFAULT_COST_CONFIG.fixedApiAnnualUsd,
    ),
    slippageBpsPerSide: num(
      env.EVAL_SLIPPAGE_BPS,
      DEFAULT_COST_CONFIG.slippageBpsPerSide,
    ),
    commissionPerTradeUsd: num(
      env.EVAL_COMMISSION_PER_TRADE_USD,
      DEFAULT_COST_CONFIG.commissionPerTradeUsd,
    ),
  };
}

export async function getCostModel(opts?: {
  config?: CostConfig;
  readLatestSnapshotImpl?: typeof readLatestSnapshot;
  readJournalImpl?: typeof readJournal;
  readDiagnosticsImpl?: typeof readResearchDiagnostics;
}): Promise<CostModel> {
  const [latest, allJournal, diagnostics] = await Promise.all([
    (opts?.readLatestSnapshotImpl ?? readLatestSnapshot)("paper"),
    (opts?.readJournalImpl ?? readJournal)(),
    (opts?.readDiagnosticsImpl ?? readResearchDiagnostics)(),
  ]);

  const config = opts?.config ?? resolveCostConfig();
  const curve = latest?.equityCurve ?? [];
  const windowStart = curve.length > 0 ? curve[0].date : null;
  const windowEnd = curve.length > 0 ? curve[curve.length - 1].date : null;
  const capitalBaseUsd = curve.length > 0 ? curve[0].equity : null;

  const paperTrades = allJournal.filter(
    (e) => e.account === "paper" && e.kind === "trade",
  ) as { qty: number; price: number }[];

  const meteredCalls: MeteredCall[] = diagnostics.map(
    (d: ResearchDiagnostic) => ({ at: d.at, cost: d.cost }),
  );

  return buildCostModel({
    windowStart,
    windowEnd,
    capitalBaseUsd,
    meteredCalls,
    fills: fillsFromExecutedTrades(paperTrades),
    config,
  });
}
