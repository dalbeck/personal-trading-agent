/**
 * Go / no-go decision (cost-aware-scorecard M3) — turns the net-of-cost,
 * benchmark-relative numbers (M2) into a single, unambiguous **GO / NO-GO /
 * NOT-YET** verdict so the live-funding question isn't subjective.
 *
 * **Advisory only — changes no gate.** The two human gates remain the sole
 * real-money boundary (see `.agents/infra.md`); this verdict informs the owner's
 * decision, it does not trigger anything.
 *
 * **Pure** (no IO): inputs in, verdict out, so each path is unit-tested. The
 * server assembler (`src/lib/server/go-no-go.ts`) feeds it from the net
 * performance + closed-trade count + env config. Ratios are fractions
 * (0.03 === +3%); drawdowns are ≤ 0.
 */

export type GoNoGoVerdict = "GO" | "NO-GO" | "NOT-YET";

export interface GoNoGoConfig {
  /** Minimum elapsed months before a GO/NO-GO is meaningful (sample gate). */
  minMonths: number;
  /** Minimum closed round-trips before a GO/NO-GO is meaningful (sample gate). */
  minClosedTrades: number;
  /** Net-of-cost annualized excess vs SPY must exceed this margin (fraction). */
  minNetExcessAnnualizedPct: number;
  /**
   * Max-drawdown cap (a negative fraction, e.g. −0.15). `null` = compare against
   * SPY's own max drawdown over the window instead of a fixed cap.
   */
  maxDrawdownCapPct: number | null;
}

export const DEFAULT_GO_NO_GO_CONFIG: GoNoGoConfig = {
  minMonths: 3,
  minClosedTrades: 20,
  // Must strictly beat passive after costs — a default margin of 0.
  minNetExcessAnnualizedPct: 0,
  // Default: didn't beat SPY by taking more drawdown than SPY itself.
  maxDrawdownCapPct: null,
};

/** Calendar days that stand in for one month of the elapsed-time floor. */
export const DAYS_PER_MONTH = 30;

export interface SampleProgress {
  closedTrades: number;
  minClosedTrades: number;
  windowDays: number;
  /** Elapsed-days floor (minMonths × 30). */
  minDays: number;
  tradesMet: boolean;
  durationMet: boolean;
  sampleMet: boolean;
}

export interface GoNoGoResult {
  verdict: GoNoGoVerdict;
  /** One-line, plain-English summary for the panel. */
  summary: string;
  /** The criterion that produced a NO-GO; `null` for GO / NOT-YET. */
  failedCriterion: string | null;
  sample: SampleProgress;
  netExcessAnnualizedPct: number | null;
  strategyMaxDrawdownPct: number | null;
  benchmarkMaxDrawdownPct: number | null;
  /** The drawdown cap actually applied (config cap or SPY's drawdown). */
  drawdownCapPct: number | null;
  railBreaches: number;
}

const EPS = 1e-9;

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function decideGoNoGo(input: {
  windowDays: number;
  closedTrades: number;
  netExcessAnnualizedPct: number | null;
  strategyMaxDrawdownPct: number | null;
  benchmarkMaxDrawdownPct: number | null;
  railBreaches: number;
  config?: GoNoGoConfig;
}): GoNoGoResult {
  const config = input.config ?? DEFAULT_GO_NO_GO_CONFIG;
  const minDays = config.minMonths * DAYS_PER_MONTH;

  const tradesMet = input.closedTrades >= config.minClosedTrades;
  const durationMet = input.windowDays >= minDays;
  const sampleMet = tradesMet && durationMet;

  const sample: SampleProgress = {
    closedTrades: input.closedTrades,
    minClosedTrades: config.minClosedTrades,
    windowDays: input.windowDays,
    minDays,
    tradesMet,
    durationMet,
    sampleMet,
  };

  const drawdownCapPct =
    config.maxDrawdownCapPct ?? input.benchmarkMaxDrawdownPct;

  const common = {
    sample,
    netExcessAnnualizedPct: input.netExcessAnnualizedPct,
    strategyMaxDrawdownPct: input.strategyMaxDrawdownPct,
    benchmarkMaxDrawdownPct: input.benchmarkMaxDrawdownPct,
    drawdownCapPct,
    railBreaches: input.railBreaches,
  };

  // 1. Minimum sample gate — don't let a short lucky streak read as GO.
  if (!sampleMet) {
    return {
      ...common,
      verdict: "NOT-YET",
      failedCriterion: null,
      summary:
        `NOT-YET — ${input.closedTrades}/${config.minClosedTrades} trades; ` +
        `${input.windowDays}/${minDays} days` +
        (input.netExcessAnnualizedPct !== null
          ? `; tracking ${fmtPct(input.netExcessAnnualizedPct)} net excess annualized`
          : ""),
    };
  }

  const noGo = (failedCriterion: string): GoNoGoResult => ({
    ...common,
    verdict: "NO-GO",
    failedCriterion,
    summary: `NO-GO — ${failedCriterion}.`,
  });

  // 2. Net-of-cost annualized excess vs SPY must beat the margin.
  if (input.netExcessAnnualizedPct === null) {
    return noGo("net-of-cost excess vs SPY is unavailable (can't prove the edge)");
  }
  if (input.netExcessAnnualizedPct <= config.minNetExcessAnnualizedPct + EPS) {
    return noGo(
      `net-of-cost annualized excess vs SPY is ${fmtPct(input.netExcessAnnualizedPct)} ` +
        `(must beat ${fmtPct(config.minNetExcessAnnualizedPct)})`,
    );
  }

  // 3. Max drawdown must be no worse than the cap (SPY's, or a configured cap).
  if (input.strategyMaxDrawdownPct === null || drawdownCapPct === null) {
    return noGo("drawdown comparison vs SPY is unavailable");
  }
  if (Math.abs(input.strategyMaxDrawdownPct) > Math.abs(drawdownCapPct) + EPS) {
    return noGo(
      `max drawdown ${fmtPct(input.strategyMaxDrawdownPct)} is worse than the ` +
        `${fmtPct(drawdownCapPct)} cap`,
    );
  }

  // 4. Zero hard-rail breaches.
  if (input.railBreaches > 0) {
    return noGo(
      `${input.railBreaches} hard-rail breach${input.railBreaches === 1 ? "" : "es"}`,
    );
  }

  return {
    ...common,
    verdict: "GO",
    failedCriterion: null,
    summary:
      `GO — beat SPY by ${fmtPct(input.netExcessAnnualizedPct)} net annualized after costs, ` +
      `drawdown within the cap, zero hard-rail breaches.`,
  };
}
