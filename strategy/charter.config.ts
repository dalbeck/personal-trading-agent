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
  // Per-sector concentration — ≤ 40% of equity in any single sector, so a
  // 5-position book can't be three correlated names (3 × 20% = 60% > 40%).
  maxSectorWeightPct: 0.4,
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
 * Phase 3 **autonomous-discovery** caps — bounds on one research/discovery run.
 * Mirror of the "Discovery caps" section in `strategy/charter.md`; keep in
 * lockstep (the `charter-config.test.ts` tripwire enforces it).
 *
 * **These are a review-funnel PREFERENCE, not a safety rail (M1).** The idea
 * cap and the per-sector spread shape the size and mix of the *review queue*;
 * they are decoupled from — and far more generous than — the hard `maxOrdersPerDay`
 * rail (6, unchanged in `RISK_LIMITS`). A larger funnel of *candidates* never
 * loosens execution: every proposal still clears the rails + red-team, only ≤6
 * orders a day can ever be placed, and discovery output is review-only (never
 * auto-acted; auto-added watchlist symbols are tracking-only). The agent can
 * never raise `maxIdeaCap` or `maxWatchlistSymbols` — those bound the funnel;
 * the human tunes `ideaCap` / `maxProposalsPerSector` / `minSectorsTarget`
 * within them from the Risk-settings discovery panel (M3).
 */
export interface DiscoveryLimits {
  /** Default NEW proposals a single discovery run may emit — the **idea cap**
   *  (`DISCOVERY_IDEA_CAP`), a generous review-funnel preference decoupled from
   *  the daily ORDER cap. The human can tune it (M3), bounded by `maxIdeaCap`. */
  ideaCap: number;
  /** Hard ceiling the tunable `ideaCap` may be raised to — the funnel can grow
   *  but never without bound. The agent can never raise this. */
  maxIdeaCap: number;
  /** Best-in-sector cap: max proposals from any one sector per run, so the
   *  queue is a sector-diversified mix, not all one hot sector. Tunable (M3). */
  maxProposalsPerSector: number;
  /** Spread target: aim to represent at least this many sectors when setups
   *  exist (skip a sector with no decent setup rather than force one). */
  minSectorsTarget: number;
  /** Max total symbols the watchlist may hold — bounds auto-added discovery
   *  candidates so the tracked universe stays curated. */
  maxWatchlistSymbols: number;
}

export const DISCOVERY_LIMITS: DiscoveryLimits = {
  // Generous default funnel — surface many ranked candidates, not just the few a
  // day could act on. Decoupled from the 6-order/day hard rail (review ≠ order).
  ideaCap: 20,
  // The funnel can be cranked up to here, never beyond.
  maxIdeaCap: 40,
  // Best-in-sector: at most 3 names per sector keeps the queue a diversified mix.
  maxProposalsPerSector: 3,
  // Aim for breadth — at least 3 sectors represented when the setups exist.
  minSectorsTarget: 3,
  // Keep the tracked universe bounded; discovery auto-adds stop at this ceiling.
  maxWatchlistSymbols: 20,
};
