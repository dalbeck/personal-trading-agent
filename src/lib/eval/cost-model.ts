/**
 * Cost model (cost-aware-scorecard M1) — converts the app's real run-cost into a
 * dollar drag (and a cost-as-%-of-capital drag) over an evaluation window, so the
 * scorecard can report **net-of-cost** performance, not just gross paper P&L.
 *
 * Four itemized lines, mirroring what the live version would actually pay:
 *  - **Fixed API (FMP):** the configured annual subscription amortized across the
 *    window (annual ÷ 365 × window days). Default $0 — honest on the free tier.
 *  - **Metered API (Perplexity):** the **actual** per-call billed amounts already
 *    logged to `data/research/diagnostics.json`, summed over the window. Never an
 *    estimate — the real numbers are there.
 *  - **Slippage:** marketable-limit orders cross the spread. Use the realized
 *    fill-vs-mid when a fill carries it; otherwise a conservative per-side bps
 *    assumption on the executed notional.
 *  - **Commission:** an explicit line (default $0 — Alpaca/Robinhood) so the model
 *    is complete and future-proof if a broker ever charges.
 *
 * **Pure** (no IO): values in, itemized model out, so the math is unit-tested in
 * isolation. The server resolver (`src/lib/server/cost.ts`) reads the diagnostics
 * ring + the journal fills + the env config and feeds this. Ratios are fractions
 * (0.0123 === 1.23%), matching the rest of the contracts.
 */

export interface CostConfig {
  /** FMP annual subscription (USD). 0 = free tier (the default). */
  fixedApiAnnualUsd: number;
  /** Conservative per-side slippage assumption when no realized fill-vs-mid. */
  slippageBpsPerSide: number;
  /** Per-fill commission (USD). 0 for Alpaca/Robinhood; kept for completeness. */
  commissionPerTradeUsd: number;
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  // Free tier by default — the owner has not bought a paid FMP plan.
  fixedApiAnnualUsd: 0,
  // ~5 bps each way is conservative for liquid large-caps.
  slippageBpsPerSide: 5,
  // Zero-commission brokers.
  commissionPerTradeUsd: 0,
};

/** One metered research call — the billed `cost` (USD) when the API reported it. */
export interface MeteredCall {
  /** ISO datetime the call resolved (matches a `ResearchDiagnostic.at`). */
  at: string;
  cost?: number | null;
}

/** One executed order side (a buy or a sell) for slippage/commission modeling. */
export interface CostFill {
  /** |qty × price| for the side (USD). */
  notionalUsd: number;
  /** Realized slippage in dollars (fill vs mid), when known; else the bps model. */
  fillVsMidUsd?: number | null;
}

export interface CostLine {
  label: string;
  amountUsd: number;
  /** One-line, human-readable derivation of the amount. */
  detail: string;
}

export interface CostModel {
  /** Calendar days spanned by [windowStart, windowEnd]; 0 when dates are absent. */
  windowDays: number;
  /** Number of executed order sides modeled. */
  fills: number;
  lines: {
    fixedApi: CostLine;
    meteredApi: CostLine;
    slippage: CostLine;
    commission: CostLine;
  };
  totalUsd: number;
  capitalBaseUsd: number | null;
  /** total ÷ capital base, a fraction; `null` when the base is unknown or 0. */
  costDragPct: number | null;
}

export interface CostModelInput {
  /** ISO date (YYYY-MM-DD) bounds of the evaluation window; null when unknown. */
  windowStart: string | null;
  windowEnd: string | null;
  /** Capital the drag is expressed against (e.g. starting equity); null = unknown. */
  capitalBaseUsd: number | null;
  meteredCalls: MeteredCall[];
  fills: CostFill[];
  config?: CostConfig;
}

/**
 * Map executed trade sides (journal `trade` entries) to {@link CostFill}s — one
 * fill per side, notional `|qty × price|`. The desk doesn't persist fill-vs-mid,
 * so realized slippage is left `null` and the bps model applies; the seam is kept
 * so a future fill record carrying mid can supply `fillVsMidUsd`.
 */
export function fillsFromExecutedTrades(
  trades: { qty: number; price: number }[],
): CostFill[] {
  return trades.map((t) => ({
    notionalUsd: Math.abs(t.qty * t.price),
    fillVsMidUsd: null,
  }));
}

const DAYS_PER_YEAR = 365;
const BPS_DENOM = 10_000;

/** Calendar days between two ISO dates (UTC midnight diff, rounded, ≥ 0). */
function daysBetween(start: string, end: string): number {
  const ms =
    new Date(`${end}T00:00:00Z`).getTime() -
    new Date(`${start}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** True when `at`'s date falls within the (optional) [start, end] bounds. */
function inWindow(
  at: string,
  start: string | null,
  end: string | null,
): boolean {
  const day = at.slice(0, 10);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

export function buildCostModel(input: CostModelInput): CostModel {
  const config = input.config ?? DEFAULT_COST_CONFIG;
  const windowDays =
    input.windowStart && input.windowEnd
      ? daysBetween(input.windowStart, input.windowEnd)
      : 0;

  // Fixed API — amortized over the window.
  const fixedApiUsd =
    (config.fixedApiAnnualUsd * windowDays) / DAYS_PER_YEAR;

  // Metered API — the real billed amounts, summed in-window.
  const inWindowCalls = input.meteredCalls.filter((c) =>
    inWindow(c.at, input.windowStart, input.windowEnd),
  );
  const meteredApiUsd = inWindowCalls.reduce((s, c) => s + (c.cost ?? 0), 0);

  // Slippage — realized fill-vs-mid where known, else the bps model.
  let modeledSides = 0;
  let realizedSides = 0;
  const slippageUsd = input.fills.reduce((s, f) => {
    if (f.fillVsMidUsd != null) {
      realizedSides += 1;
      return s + Math.abs(f.fillVsMidUsd);
    }
    modeledSides += 1;
    return s + Math.abs(f.notionalUsd) * (config.slippageBpsPerSide / BPS_DENOM);
  }, 0);

  // Commission — explicit, per executed side.
  const commissionUsd = input.fills.length * config.commissionPerTradeUsd;

  const totalUsd = fixedApiUsd + meteredApiUsd + slippageUsd + commissionUsd;
  const capitalBaseUsd = input.capitalBaseUsd;
  const costDragPct =
    capitalBaseUsd && capitalBaseUsd > 0 ? totalUsd / capitalBaseUsd : null;

  const slippageDetail =
    realizedSides > 0
      ? `${realizedSides} realized + ${modeledSides} @ ${config.slippageBpsPerSide} bps/side`
      : `${modeledSides} side(s) @ ${config.slippageBpsPerSide} bps/side`;

  return {
    windowDays,
    fills: input.fills.length,
    lines: {
      fixedApi: {
        label: "Fixed API (FMP)",
        amountUsd: fixedApiUsd,
        detail:
          config.fixedApiAnnualUsd > 0
            ? `$${config.fixedApiAnnualUsd}/yr amortized over ${windowDays} day(s)`
            : "free tier ($0/yr)",
      },
      meteredApi: {
        label: "Metered API (Perplexity)",
        amountUsd: meteredApiUsd,
        detail: `${inWindowCalls.length} billed call(s) in window`,
      },
      slippage: {
        label: "Spread / slippage",
        amountUsd: slippageUsd,
        detail: slippageDetail,
      },
      commission: {
        label: "Commission",
        amountUsd: commissionUsd,
        detail:
          config.commissionPerTradeUsd > 0
            ? `${input.fills.length} fill(s) @ $${config.commissionPerTradeUsd}`
            : "$0 (zero-commission broker)",
      },
    },
    totalUsd,
    capitalBaseUsd: capitalBaseUsd ?? null,
    costDragPct,
  };
}
