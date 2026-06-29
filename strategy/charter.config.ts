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
 * Per-sleeve rail blocks (per-sleeve-rails M2). The risk engine resolves a
 * proposal's rails from its **sleeve** (`railsForSleeve` in
 * `strategy/sleeves.config.ts`) rather than one global block. `RISK_LIMITS` above
 * stays the **swing** block, byte-unchanged and tripwire-tested; the two blocks
 * below are the new horizons' rail numbers. The **safety envelope is still
 * shared and unchanged**: every block keeps `maxOrdersPerDay: 6` (the single
 * cross-sleeve daily order counter — more sleeves never means more orders), the
 * marketable-limit-only order type, and the same drawdown/emergency halts; and
 * the live envelope (`LIVE_LIMITS`) binds every sleeve regardless. The agent can
 * never raise any of these.
 */

/**
 * **Mid-term / position** rails (`position-mid`). A weeks–quarters book: the same
 * ≤2% risk-to-stop cap and a **stop still required**, but a **slightly larger
 * per-name size** (25% vs the swing 20%) for a higher-conviction, longer hold.
 * Sector, count, drawdown, emergency, order-type, universe, and the daily cap are
 * the swing values. (Declared in M2; the sleeve is enabled in M4.)
 */
export const POSITION_MID_LIMITS: RiskLimits = {
  perPositionRiskPct: 0.02,
  perPositionSizePct: 0.25,
  maxSectorWeightPct: 0.4,
  maxConcurrentPositions: 5,
  maxOrdersPerDay: 6,
  drawdownHaltPct: 0.1,
  emergencySpyDropPct: 0.02,
  emergencyVixLevel: 30,
  allowedOrderTypes: ["marketable_limit"],
  allowedAssetClasses: ["equity"],
  excludedSymbols: ["SPY"],
};

/**
 * **Long-term / core** rails (`core-long`). A quarters–years book sized by
 * **target allocation weight** (sizing model `target-weight`), with **no
 * protective stop** — a wide drawdown/review trigger stands in (`requiresStop:
 * false` on the sleeve; the `review-trigger` rail enforces it). A core holding is
 * deliberately a **larger slice** (up to 60% per name) and the **sector cap is
 * looser** (60%) because a broad core position is meant to be concentrated; the
 * account-level drawdown halt and the live exposure ceiling still bind.
 *
 * **Universe (core-long M3): ETFs and index funds are permitted, and SPY/VOO/QQQ
 * are NOT excluded** — they are valid core holdings here (they stay benchmark-only
 * and SPY-excluded in the swing sleeves). ETFs/index funds trade as **equity-class**
 * instruments, so the asset-class rail already admits them; the only per-sleeve
 * universe change is clearing the benchmark exclusion (`excludedSymbols: []`). A
 * liquidity floor still applies upstream; the ATR volatility cap does not gate
 * broad ETFs. (Declared in M2; enabled — universe + lens — in M3.)
 */
export const CORE_LONG_LIMITS: RiskLimits = {
  perPositionRiskPct: 0.02,
  perPositionSizePct: 0.6,
  maxSectorWeightPct: 0.6,
  maxConcurrentPositions: 5,
  maxOrdersPerDay: 6,
  drawdownHaltPct: 0.1,
  emergencySpyDropPct: 0.02,
  emergencyVixLevel: 30,
  allowedOrderTypes: ["marketable_limit"],
  // ETFs/index funds are equity-class instruments — no new asset class needed.
  allowedAssetClasses: ["equity"],
  // SPY/VOO/QQQ are permitted core holdings (unlike the swing sleeves).
  excludedSymbols: [],
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
