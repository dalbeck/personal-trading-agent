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
import {
  buildLiveBookPerformance,
  type LiveBookPerformance,
} from "@/lib/eval/live-performance";
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
  // Injectable readers (default the real `data/` readers) so the paper scoping
  // is unit-tested hermetically.
  readLatestSnapshotImpl?: typeof readLatestSnapshot;
  readSnapshotsImpl?: typeof readSnapshots;
  readJournalImpl?: typeof readJournal;
  readProposalsImpl?: typeof readProposals;
  readRunLogsImpl?: typeof readRunLogs;
}): Promise<Scorecard> {
  const [latest, allSnapshots, allJournal, proposals, runLogs] =
    await Promise.all([
      (opts?.readLatestSnapshotImpl ?? readLatestSnapshot)("paper"),
      (opts?.readSnapshotsImpl ?? readSnapshots)(),
      (opts?.readJournalImpl ?? readJournal)(),
      (opts?.readProposalsImpl ?? readProposals)(),
      (opts?.readRunLogsImpl ?? readRunLogs)(),
    ]);

  // Paper proving-ground only: live trades and the routinely-refreshed live
  // snapshots (M2) are a different book and must not contaminate this score
  // (no paper/live bleed). The live book has its own performance surface.
  const snapshots = allSnapshots.filter((s) => s.account === "paper");
  const journal = allJournal.filter((e) => e.account === "paper");

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

/**
 * Live-book performance for the Evaluation LIVE view (M3): unrealized P&L vs
 * cost basis (from the latest live snapshot) and vs SPY where the snapshot
 * carries a benchmark, plus the number of live exits taken (live `sell` trade
 * entries). Returns `null` when there is no live snapshot (no live book yet).
 * Read-only; lives alongside the paper scorecard but is never mixed into it.
 */
export async function getLiveBookPerformance(opts?: {
  readLatestSnapshotImpl?: typeof readLatestSnapshot;
  readJournalImpl?: typeof readJournal;
}): Promise<LiveBookPerformance | null> {
  const [snapshot, journal] = await Promise.all([
    (opts?.readLatestSnapshotImpl ?? readLatestSnapshot)("live"),
    (opts?.readJournalImpl ?? readJournal)(),
  ]);
  const exitsTaken = journal.filter(
    (e) => e.account === "live" && e.kind === "trade" && e.action === "sell",
  ).length;
  return buildLiveBookPerformance(snapshot, { exitsTaken });
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
