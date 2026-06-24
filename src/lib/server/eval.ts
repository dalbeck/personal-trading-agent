import "server-only";

import { getDailyCloses, hasAlpacaCredentials } from "./alpaca";
import {
  readJournal,
  readLatestSnapshot,
  readProposals,
  readRunLogs,
  readSnapshots,
} from "./data";
import {
  buildScorecard,
  computeReturnMetrics,
  type BenchmarkInput,
  type Scorecard,
} from "@/lib/eval/scorecard";
import type { EquityPoint } from "@/lib/types";

/**
 * Server-only assembler for the Phase 2 evaluation scorecard. Reads the local
 * `data/` artifacts (snapshots, journal, proposals, run logs) and feeds the
 * pure `buildScorecard` math.
 *
 * Benchmark (SPY): the desk equity curve and window come from the latest
 * **paper** snapshot (Alpaca is the source of truth — we never add a second
 * price feed for the desk). For the benchmark we pull SPY's own daily closes
 * over the same window from Alpaca's market-data API to get its return,
 * drawdown, and volatility — best-effort: if keys are absent or the call
 * fails, we fall back to the benchmark return already on the snapshot and leave
 * drawdown/volatility unknown. Benchmark/context only, never order pricing.
 */
export async function getEvaluationScorecard(opts?: {
  fetchCloses?: (
    symbol: string,
    start: string,
    end: string,
  ) => Promise<EquityPoint[]>;
}): Promise<Scorecard> {
  const [latest, snapshots, journal, proposals, runLogs] = await Promise.all([
    readLatestSnapshot("paper"),
    readSnapshots(),
    readJournal(),
    readProposals(),
    readRunLogs(),
  ]);

  const equityCurve = latest?.equityCurve ?? [];
  const benchmark = await resolveBenchmark(
    latest?.benchmark ?? null,
    equityCurve,
    opts?.fetchCloses,
  );

  return buildScorecard({
    equityCurve,
    journal,
    snapshots,
    runLogs,
    proposalsGenerated: proposals.length,
    benchmark,
  });
}

async function resolveBenchmark(
  snapshotBenchmark: { symbol: string; benchmarkReturnPct: number } | null,
  equityCurve: EquityPoint[],
  fetchCloses?: (
    symbol: string,
    start: string,
    end: string,
  ) => Promise<EquityPoint[]>,
): Promise<BenchmarkInput | null> {
  const symbol = snapshotBenchmark?.symbol ?? "SPY";
  // The benchmark return recorded on the snapshot is the always-available
  // fallback when we can't fetch a price series.
  const fallback: BenchmarkInput | null = snapshotBenchmark
    ? { symbol, returnPct: snapshotBenchmark.benchmarkReturnPct }
    : null;

  const fetcher = fetchCloses ?? defaultFetchCloses;
  if (!fetcher || equityCurve.length < 2) return fallback;

  const start = equityCurve[0].date;
  const end = equityCurve[equityCurve.length - 1].date;
  try {
    const closes = await fetcher(symbol, start, end);
    if (closes.length < 2) return fallback;
    const m = computeReturnMetrics(closes);
    return {
      symbol,
      // Prefer the freshly computed series return; fall back to the snapshot's.
      returnPct: m.totalReturnPct ?? fallback?.returnPct ?? null,
      maxDrawdownPct: m.maxDrawdownPct,
      volatility: m.volatility,
    };
  } catch {
    return fallback; // best-effort — the scorecard still renders without SPY drawdown
  }
}

/** Real Alpaca data-API close series, or `null` when no credentials. */
const defaultFetchCloses = hasAlpacaCredentials()
  ? (symbol: string, start: string, end: string) =>
      getDailyCloses(symbol, start, end)
  : null;
