import "server-only";

import {
  readJournal,
  readLatestSnapshot,
  readProposals,
  readRunLogs,
  readSnapshots,
} from "./data";
import { buildScorecard, type Scorecard } from "@/lib/eval/scorecard";

/**
 * Server-only assembler for the Phase 2 evaluation scorecard. Reads the local
 * `data/` artifacts (snapshots, journal, proposals, run logs) and feeds the
 * pure `buildScorecard` math. The equity curve and SPY benchmark come from the
 * latest **paper** snapshot (Alpaca is the source of truth; we never fetch a
 * second price feed here). SPY drawdown/volatility need a SPY price series and
 * are left for a future enrichment — only the benchmark *return* is wired now.
 */
export async function getEvaluationScorecard(): Promise<Scorecard> {
  const [latest, snapshots, journal, proposals, runLogs] = await Promise.all([
    readLatestSnapshot("paper"),
    readSnapshots(),
    readJournal(),
    readProposals(),
    readRunLogs(),
  ]);

  const equityCurve = latest?.equityCurve ?? [];
  const benchmark = latest?.benchmark
    ? {
        symbol: latest.benchmark.symbol,
        returnPct: latest.benchmark.benchmarkReturnPct,
      }
    : null;

  return buildScorecard({
    equityCurve,
    journal,
    snapshots,
    runLogs,
    proposalsGenerated: proposals.length,
    benchmark,
  });
}
