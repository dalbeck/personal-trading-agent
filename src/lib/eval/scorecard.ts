import type {
  EquityPoint,
  JournalEntry,
  PortfolioSnapshot,
  RunLog,
  TradeJournalEntry,
} from "@/lib/types";

/**
 * Phase 2 evaluation scorecard — the data-driven version of
 * `planning/phase-2-evaluation-scorecard.md`, the go/no-go gate to the Phase 3
 * live pilot (M5).
 *
 * Everything here is **pure** (no IO): metrics in, metrics out, so the gate
 * math is unit-tested in isolation. `src/lib/server/eval.ts` does the reading
 * from `data/` and feeds these functions. Ratios are fractions, not percents
 * (0.0482 === +4.82%), matching the rest of the contracts.
 *
 * This is a process rubric, not investment advice. The verdict is **advisory**:
 * it flags hard failures and missing inputs, but the final GO is a human call
 * (and several rubric criteria — section 5 — are inherently qualitative).
 */

export interface WindowInfo {
  startDate: string | null;
  endDate: string | null;
  /** Number of equity-curve points in the window (a proxy for sample size). */
  points: number;
  startingEquity: number | null;
  endingEquity: number | null;
}

export interface ReturnMetrics {
  totalReturnPct: number | null;
  maxDrawdownPct: number | null; // ≤ 0, e.g. -0.062
  returnOverMaxDd: number | null;
  /** Sample stdev of period-over-period returns (per-period, not annualized). */
  volatility: number | null;
  /** Simple Sharpe: mean periodic return ÷ periodic stdev, rf = 0. */
  sharpe: number | null;
}

export interface BenchmarkInput {
  symbol: string;
  returnPct: number | null;
  /** Benchmark max drawdown over the window (≤ 0); null when no price series. */
  maxDrawdownPct?: number | null;
  /** Benchmark per-period volatility; null when no price series. */
  volatility?: number | null;
}

export interface BenchmarkComparison {
  symbol: string;
  deskReturnPct: number | null;
  benchmarkReturnPct: number | null;
  /** Desk return − benchmark return (alpha). `null` if either side is unknown. */
  excessReturnPct: number | null;
  deskMaxDrawdownPct: number | null;
  benchmarkMaxDrawdownPct: number | null;
  benchmarkVolatility: number | null;
  /**
   * How much worse the desk's drawdown is than the benchmark's, in fraction
   * points (positive = desk drew down more). `null` when either is unknown.
   */
  drawdownExcessPct: number | null;
}

export interface ClosedTrade {
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryDate: string;
  exitDate: string;
  holdingDays: number;
  pnl: number; // dollars
  pnlPct: number; // fraction of cost basis
}

export interface TradeStats {
  tradesClosed: number;
  winRate: number | null; // fraction of closed trades that were winners
  avgWinPct: number | null;
  avgLossPct: number | null;
  profitFactor: number | null; // gross win $ ÷ gross loss $
  avgHoldingDays: number | null;
  largestWinPct: number | null;
  largestLossPct: number | null;
  proposalsGenerated: number;
  ordersExecuted: number; // trade journal entries written
  closed: ClosedTrade[];
}

export interface ProcessIntegrity {
  ordersBlockedByRules: number;
  ordersBlockedByRedTeam: number;
  ordersBlockedByHuman: number;
  /** Buys recorded with no protective stop — must be 0. */
  ordersWithoutStop: number;
  /** Any real-money (`live`) snapshot present — must be 0 in the paper window. */
  realMoneyPathTouched: boolean;
  /** Hard-fail flags that block a GO regardless of P&L. */
  passes: boolean;
}

export interface Reliability {
  totalRuns: number;
  completed: number; // status "ok"
  errored: number;
  skipped: number;
  locked: number;
}

export type VerdictKind = "go-candidate" | "iterate" | "no-go" | "incomplete";

export interface Verdict {
  kind: VerdictKind;
  reasons: string[];
}

export interface Scorecard {
  window: WindowInfo;
  returns: ReturnMetrics;
  benchmark: BenchmarkComparison;
  trades: TradeStats;
  integrity: ProcessIntegrity;
  reliability: Reliability;
  verdict: Verdict;
}

/* ----------------------------- return metrics ----------------------------- */

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (n−1). `null` for fewer than two points. */
function sampleStdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const variance =
    xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export function computeReturnMetrics(curve: EquityPoint[]): ReturnMetrics {
  if (curve.length < 2) {
    return {
      totalReturnPct: null,
      maxDrawdownPct: null,
      returnOverMaxDd: null,
      volatility: null,
      sharpe: null,
    };
  }

  const first = curve[0].equity;
  const last = curve[curve.length - 1].equity;
  const totalReturnPct = first !== 0 ? last / first - 1 : null;

  // Max peak-to-trough drawdown across the curve.
  let peak = curve[0].equity;
  let maxDrawdownPct = 0;
  for (const { equity } of curve) {
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = equity / peak - 1; // ≤ 0
      if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    }
  }

  // Period-over-period simple returns.
  const periodReturns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    if (prev !== 0) periodReturns.push(curve[i].equity / prev - 1);
  }

  const volatility = sampleStdev(periodReturns);
  const sharpe =
    volatility && volatility !== 0 ? mean(periodReturns) / volatility : null;
  const returnOverMaxDd =
    totalReturnPct !== null && maxDrawdownPct < 0
      ? totalReturnPct / Math.abs(maxDrawdownPct)
      : null;

  return {
    totalReturnPct,
    maxDrawdownPct: maxDrawdownPct < 0 ? maxDrawdownPct : 0,
    returnOverMaxDd,
    volatility,
    sharpe,
  };
}

export function computeWindow(curve: EquityPoint[]): WindowInfo {
  if (curve.length === 0) {
    return {
      startDate: null,
      endDate: null,
      points: 0,
      startingEquity: null,
      endingEquity: null,
    };
  }
  return {
    startDate: curve[0].date,
    endDate: curve[curve.length - 1].date,
    points: curve.length,
    startingEquity: curve[0].equity,
    endingEquity: curve[curve.length - 1].equity,
  };
}

/* ------------------------------ trade stats ------------------------------- */

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

type OpenLot = { qty: number; price: number; date: string };

/**
 * Pair buys with sells into closed round-trips, FIFO per symbol (long-only —
 * the charter's proving ground). A sell with no open buy lot (e.g. a short
 * open) is ignored for round-trip stats; unmatched open buys stay open.
 */
export function matchClosedTrades(journal: JournalEntry[]): ClosedTrade[] {
  const trades = journal
    .filter((e): e is TradeJournalEntry => e.kind === "trade")
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const open = new Map<string, OpenLot[]>();
  const closed: ClosedTrade[] = [];

  for (const t of trades) {
    const date = t.timestamp.slice(0, 10);
    if (t.action === "buy") {
      const lots = open.get(t.symbol) ?? [];
      lots.push({ qty: t.qty, price: t.price, date });
      open.set(t.symbol, lots);
      continue;
    }
    // sell → close against FIFO open lots
    let remaining = t.qty;
    const lots = open.get(t.symbol) ?? [];
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.qty);
      const pnl = matched * (t.price - lot.price);
      closed.push({
        symbol: t.symbol,
        qty: matched,
        entryPrice: lot.price,
        exitPrice: t.price,
        entryDate: lot.date,
        exitDate: date,
        holdingDays: daysBetween(lot.date, date),
        pnl,
        pnlPct: lot.price !== 0 ? (t.price - lot.price) / lot.price : 0,
      });
      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 0) lots.shift();
    }
    open.set(t.symbol, lots);
  }

  return closed;
}

export function computeTradeStats(
  journal: JournalEntry[],
  proposalsGenerated: number,
): TradeStats {
  const closed = matchClosedTrades(journal);
  const ordersExecuted = journal.filter((e) => e.kind === "trade").length;

  if (closed.length === 0) {
    return {
      tradesClosed: 0,
      winRate: null,
      avgWinPct: null,
      avgLossPct: null,
      profitFactor: null,
      avgHoldingDays: null,
      largestWinPct: null,
      largestLossPct: null,
      proposalsGenerated,
      ordersExecuted,
      closed,
    };
  }

  const wins = closed.filter((c) => c.pnl > 0);
  const losses = closed.filter((c) => c.pnl < 0);
  const grossWin = wins.reduce((s, c) => s + c.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, c) => s + c.pnl, 0));

  return {
    tradesClosed: closed.length,
    winRate: wins.length / closed.length,
    avgWinPct: wins.length ? mean(wins.map((c) => c.pnlPct)) : null,
    avgLossPct: losses.length ? mean(losses.map((c) => c.pnlPct)) : null,
    profitFactor: grossLoss !== 0 ? grossWin / grossLoss : null,
    avgHoldingDays: mean(closed.map((c) => c.holdingDays)),
    largestWinPct: Math.max(...closed.map((c) => c.pnlPct)),
    largestLossPct: Math.min(...closed.map((c) => c.pnlPct)),
    proposalsGenerated,
    ordersExecuted,
    closed,
  };
}

/* --------------------------- process integrity ---------------------------- */

export function computeProcessIntegrity(
  journal: JournalEntry[],
  snapshots: PortfolioSnapshot[],
): ProcessIntegrity {
  const rejections = journal.filter((e) => e.kind === "rejection");
  const ordersBlockedByRules = rejections.filter(
    (r) => r.rejectedBy === "rules",
  ).length;
  const ordersBlockedByRedTeam = rejections.filter(
    (r) => r.rejectedBy === "codex-redteam",
  ).length;
  const ordersBlockedByHuman = rejections.filter(
    (r) => r.rejectedBy === "human",
  ).length;

  const ordersWithoutStop = journal.filter(
    (e) => e.kind === "trade" && e.action === "buy" && e.stopPrice === null,
  ).length;

  const realMoneyPathTouched = snapshots.some((s) => s.account === "live");

  return {
    ordersBlockedByRules,
    ordersBlockedByRedTeam,
    ordersBlockedByHuman,
    ordersWithoutStop,
    realMoneyPathTouched,
    passes: ordersWithoutStop === 0 && !realMoneyPathTouched,
  };
}

/* ------------------------------ reliability ------------------------------- */

export function computeReliability(runLogs: RunLog[]): Reliability {
  return {
    totalRuns: runLogs.length,
    completed: runLogs.filter((l) => l.status === "ok").length,
    errored: runLogs.filter((l) => l.status === "error").length,
    skipped: runLogs.filter((l) => l.status === "skipped").length,
    locked: runLogs.filter((l) => l.status === "locked").length,
  };
}

/* -------------------------------- verdict --------------------------------- */

/** Minimum equity-curve points before a return-based verdict is meaningful. */
export const MIN_WINDOW_POINTS = 30;

/**
 * How much worse than the benchmark the desk's drawdown may be and still GO
 * (the rubric's "≤ +5pp" margin). Beyond this is "excessive drawdown" → no-go.
 */
export const MAX_DRAWDOWN_EXCESS = 0.05;

/**
 * Advisory GO/ITERATE/NO-GO on the *computable* slice of the rubric. Hard
 * process failures veto a GO; missing benchmark data yields "incomplete". The
 * qualitative criteria (section 5) and final sign-off stay with the human.
 */
export function decideVerdict(card: {
  window: WindowInfo;
  returns: ReturnMetrics;
  benchmark: BenchmarkComparison;
  integrity: ProcessIntegrity;
  reliability: Reliability;
}): Verdict {
  const reasons: string[] = [];

  // 1. Process integrity is a hard veto.
  if (!card.integrity.passes) {
    if (card.integrity.ordersWithoutStop > 0) {
      reasons.push(
        `${card.integrity.ordersWithoutStop} buy(s) recorded without a protective stop (must be 0).`,
      );
    }
    if (card.integrity.realMoneyPathTouched) {
      reasons.push("A real-money (live) snapshot is present (must be 0).");
    }
    return { kind: "no-go", reasons };
  }

  // 2. Need a benchmark return and a return to judge alpha.
  const excess = card.benchmark.excessReturnPct;
  if (excess === null || card.returns.totalReturnPct === null) {
    reasons.push(
      "Benchmark or desk return is unavailable — cannot judge excess return yet.",
    );
    return { kind: "incomplete", reasons };
  }

  // 3. Sample-size caveat (advisory, not a veto).
  if (card.window.points < MIN_WINDOW_POINTS) {
    reasons.push(
      `Only ${card.window.points} equity points (< ${MIN_WINDOW_POINTS}); the sample is small — treat any edge cautiously.`,
    );
  }

  // 4. Reliability caveat.
  if (card.reliability.errored > 0) {
    reasons.push(
      `${card.reliability.errored} routine run(s) errored — review reliability before going live.`,
    );
  }

  // 5. Headline: did the desk beat the benchmark?
  if (excess <= 0) {
    reasons.push(
      "Desk did not beat the benchmark (excess return ≤ 0) — no-go on returns.",
    );
    return { kind: "no-go", reasons };
  }

  // 6. Excessive drawdown vs the benchmark is a no-go (when SPY drawdown known).
  const ddExcess = card.benchmark.drawdownExcessPct;
  if (ddExcess !== null && ddExcess > MAX_DRAWDOWN_EXCESS) {
    reasons.push(
      `Desk drawdown is ${(ddExcess * 100).toFixed(1)}pp worse than ${card.benchmark.symbol} (> ${(MAX_DRAWDOWN_EXCESS * 100).toFixed(0)}pp margin) — excessive drawdown.`,
    );
    return { kind: "no-go", reasons };
  }

  reasons.push(
    "Desk beat the benchmark with no hard process failures. Confirm the edge is process (not one outlier) and review the qualitative criteria before any GO.",
  );
  // A small sample or an errored run downgrades a clean beat to "iterate".
  const downgraded =
    card.window.points < MIN_WINDOW_POINTS || card.reliability.errored > 0;
  return { kind: downgraded ? "iterate" : "go-candidate", reasons };
}

/* ------------------------------- assembler -------------------------------- */

export interface ScorecardInputs {
  equityCurve: EquityPoint[];
  journal: JournalEntry[];
  snapshots: PortfolioSnapshot[];
  runLogs: RunLog[];
  proposalsGenerated: number;
  benchmark: BenchmarkInput | null;
}

export function buildScorecard(inputs: ScorecardInputs): Scorecard {
  const window = computeWindow(inputs.equityCurve);
  const returns = computeReturnMetrics(inputs.equityCurve);
  const trades = computeTradeStats(inputs.journal, inputs.proposalsGenerated);
  const integrity = computeProcessIntegrity(inputs.journal, inputs.snapshots);
  const reliability = computeReliability(inputs.runLogs);

  const benchmarkReturn = inputs.benchmark?.returnPct ?? null;
  const benchmarkMaxDd = inputs.benchmark?.maxDrawdownPct ?? null;
  const benchmark: BenchmarkComparison = {
    symbol: inputs.benchmark?.symbol ?? "SPY",
    deskReturnPct: returns.totalReturnPct,
    benchmarkReturnPct: benchmarkReturn,
    excessReturnPct:
      returns.totalReturnPct !== null && benchmarkReturn !== null
        ? returns.totalReturnPct - benchmarkReturn
        : null,
    deskMaxDrawdownPct: returns.maxDrawdownPct,
    benchmarkMaxDrawdownPct: benchmarkMaxDd,
    benchmarkVolatility: inputs.benchmark?.volatility ?? null,
    // Compare magnitudes: positive means the desk drew down more than the bench.
    drawdownExcessPct:
      returns.maxDrawdownPct !== null && benchmarkMaxDd !== null
        ? Math.abs(returns.maxDrawdownPct) - Math.abs(benchmarkMaxDd)
        : null,
  };

  const verdict = decideVerdict({
    window,
    returns,
    benchmark,
    integrity,
    reliability,
  });

  return { window, returns, benchmark, trades, integrity, reliability, verdict };
}
