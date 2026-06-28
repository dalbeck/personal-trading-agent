import "server-only";

import {
  decideGoNoGo,
  DEFAULT_GO_NO_GO_CONFIG,
  type GoNoGoConfig,
  type GoNoGoResult,
} from "@/lib/eval/go-no-go";
import { matchClosedTrades } from "@/lib/eval/scorecard";
import { getNetPerformance } from "./eval";
import { readJournal, readLatestSnapshot } from "./data";
import { readResearchDiagnostics } from "./research/diagnostics";
import type { CostConfig } from "@/lib/eval/cost-model";
import type { EquityPoint } from "@/lib/types";

/**
 * Server-only assembler for the GO / NO-GO / NOT-YET decision (M3). Feeds the
 * pure {@link decideGoNoGo} from the net-of-cost performance (M2) and the count
 * of closed paper round-trips, under the env-tuned thresholds.
 *
 * **Advisory only** — it changes no gate. Paper-scoped like the rest of the
 * evaluation surface (the go/no-go gate grades the proving-ground engine).
 */

/** Resolve the go/no-go thresholds from the environment (all have safe defaults). */
export function resolveGoNoGoConfig(
  env: Record<string, string | undefined> = process.env,
): GoNoGoConfig {
  const nonNeg = (raw: string | undefined, fallback: number): number => {
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const finite = (raw: string | undefined, fallback: number): number => {
    if (raw == null || raw.trim() === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  // A negative-fraction cap (e.g. −0.15); null = compare against SPY's drawdown.
  const capRaw = env.EVAL_MAX_DRAWDOWN_CAP_PCT;
  let maxDrawdownCapPct = DEFAULT_GO_NO_GO_CONFIG.maxDrawdownCapPct;
  if (capRaw != null && capRaw.trim() !== "") {
    const n = Number(capRaw);
    if (Number.isFinite(n)) maxDrawdownCapPct = n <= 0 ? n : -n;
  }

  return {
    minMonths: nonNeg(env.EVAL_MIN_MONTHS, DEFAULT_GO_NO_GO_CONFIG.minMonths),
    minClosedTrades: nonNeg(
      env.EVAL_MIN_CLOSED_TRADES,
      DEFAULT_GO_NO_GO_CONFIG.minClosedTrades,
    ),
    minNetExcessAnnualizedPct: finite(
      env.EVAL_MIN_NET_EXCESS_ANNUALIZED_PCT,
      DEFAULT_GO_NO_GO_CONFIG.minNetExcessAnnualizedPct,
    ),
    maxDrawdownCapPct,
  };
}

export async function getGoNoGo(opts?: {
  config?: GoNoGoConfig;
  fetchCloses?: (
    symbol: string,
    start: string,
    end: string,
  ) => Promise<EquityPoint[]>;
  costConfig?: CostConfig;
  readLatestSnapshotImpl?: typeof readLatestSnapshot;
  readJournalImpl?: typeof readJournal;
  readDiagnosticsImpl?: typeof readResearchDiagnostics;
}): Promise<GoNoGoResult> {
  const config = opts?.config ?? resolveGoNoGoConfig();
  const readJournalImpl = opts?.readJournalImpl ?? readJournal;

  const [net, journal] = await Promise.all([
    getNetPerformance({
      fetchCloses: opts?.fetchCloses,
      costConfig: opts?.costConfig,
      readLatestSnapshotImpl: opts?.readLatestSnapshotImpl,
      readJournalImpl,
      readDiagnosticsImpl: opts?.readDiagnosticsImpl,
    }),
    readJournalImpl(),
  ]);

  const paperJournal = journal.filter((e) => e.account === "paper");
  const closedTrades = matchClosedTrades(paperJournal).length;

  return decideGoNoGo({
    windowDays: net.windowDays,
    closedTrades,
    netExcessAnnualizedPct: net.netExcessAnnualizedPct,
    strategyMaxDrawdownPct: net.strategyMaxDrawdownPct,
    benchmarkMaxDrawdownPct: net.benchmarkMaxDrawdownPct,
    railBreaches: net.rails.totalBreaches,
    config,
  });
}
