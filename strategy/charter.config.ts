import type { RiskLimits } from "@/lib/risk/types";

/**
 * Machine-readable mirror of the hard risk rails in `strategy/charter.md`.
 * The validators in `src/lib/risk` enforce these exact numbers in code — the
 * LLM cannot override them. **Keep this in lockstep with charter.md**; when you
 * change a number here, change it (and the change log) there in the same edit.
 */
export const RISK_LIMITS: RiskLimits = {
  // Per-position risk to the protective stop — ≤ 2% of equity.
  perPositionRiskPct: 0.02,
  // Per-position size — ≤ 20% of equity in any single name.
  perPositionSizePct: 0.2,
  // At most 5 concurrent open positions.
  maxConcurrentPositions: 5,
  // At most 6 orders per day.
  maxOrdersPerDay: 6,
  // Halt new risk at a 10% drawdown from the account high-water mark.
  drawdownHaltPct: 0.1,
  // Emergency stop (no new buys) if SPY is down ≥ 2% intraday…
  emergencySpyDropPct: 0.02,
  // …or VIX is above 30.
  emergencyVixLevel: 30,
  // Marketable-limit orders only — never a naked market or unbounded stop.
  allowedOrderTypes: ["marketable_limit"],
  // Listed US equities only — no options, crypto, futures, margin.
  allowedAssetClasses: ["equity"],
  // SPY is the benchmark, never a holding.
  excludedSymbols: ["SPY"],
};

/**
 * Phase 3 **live-pilot** caps — additional, live-only guardrails layered on top
 * of RISK_LIMITS for the funded Robinhood account. Mirror of the "Live pilot
 * caps" section in `strategy/charter.md`; keep in lockstep (the tripwire test
 * `charter-config.test.ts` enforces it). These bound the controlled live pilot;
 * the agent can never raise them.
 */
export interface LiveLimits {
  /** Max human deposits into the live account per rolling 7 days (USD). */
  weeklyFundingCapUsd: number;
  /** Hard ceiling on total live exposure across all positions (USD). */
  maxAccountExposureUsd: number;
  /** Drawdown from the live high-water mark that trips the kill switch
   *  (halt new risk + disconnect + alert). Fraction: 0.10 === −10%. */
  drawdownKillPct: number;
}

export const LIVE_LIMITS: LiveLimits = {
  // Smallest viable pilot: ~$100/week funding cap.
  weeklyFundingCapUsd: 100,
  // Hard account-level exposure ceiling for the capped pilot.
  maxAccountExposureUsd: 500,
  // Kill switch at −10% from the live high-water mark.
  drawdownKillPct: 0.1,
};

/**
 * Phase 3 **autonomous-discovery** caps — bounds on what one research/discovery
 * run may produce, so the scan can never flood the queue or the tracked
 * universe. Mirror of the "Discovery caps" section in `strategy/charter.md`;
 * keep in lockstep (the `charter-config.test.ts` tripwire enforces it). The
 * agent can never raise these. Discovery proposals are review candidates, never
 * auto-acted; auto-added watchlist symbols are tracking-only (no trade).
 */
export interface DiscoveryLimits {
  /** Max NEW trade proposals a single discovery run may emit (tracks the daily
   *  order cap so it can't queue more than a day could ever act on). */
  maxNewProposalsPerRun: number;
  /** Max total symbols the watchlist may hold — bounds auto-added discovery
   *  candidates so the tracked universe stays curated. */
  maxWatchlistSymbols: number;
}

export const DISCOVERY_LIMITS: DiscoveryLimits = {
  // Never queue more new ideas per run than a day could act on (= daily order cap).
  maxNewProposalsPerRun: 6,
  // Keep the tracked universe bounded; discovery auto-adds stop at this ceiling.
  maxWatchlistSymbols: 20,
};
