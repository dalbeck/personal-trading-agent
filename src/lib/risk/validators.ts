import type {
  ProposedOrder,
  RiskContext,
  RiskLimits,
  Side,
  Violation,
} from "./types";

/**
 * Pure validators — one per charter rail. Each returns a `Violation` when the
 * order breaks the rule, or `null` when it passes. They never throw and never
 * mutate. `evaluateOrder` (./index) runs the whole set.
 *
 * Rails that gate *new risk* only fire on entries (`buy`); exits (`sell`) are
 * never blocked by them, so a protective sell can always go through. Order-type
 * and the daily-order cap apply to every order.
 */
export type Rule = (
  order: ProposedOrder,
  ctx: RiskContext,
  limits: RiskLimits,
) => Violation | null;

const isEntry = (o: ProposedOrder): boolean => o.action === "buy";

/** A sleeve requires a stop unless it explicitly opts out (`requiresStop: false`).
 *  Absent/`true` ⇒ stop required, so swing/mid orders are unchanged. */
const requiresStop = (o: ProposedOrder): boolean => o.requiresStop !== false;

/** The widest a no-stop sleeve's drawdown/review trigger may be set — a sanity
 *  band so a "review trigger" can't be a token 99% that never fires. */
export const MAX_REVIEW_TRIGGER_PCT = 0.5;

const heldValue = (ctx: RiskContext, symbol: string): number =>
  ctx.openPositions
    .filter((p) => p.symbol === symbol)
    .reduce((sum, p) => sum + p.marketValue, 0);

const usd = (n: number): string => `$${n.toFixed(2)}`;
const pct = (f: number): string => `${(f * 100).toFixed(0)}%`;

export const allowedOrderType: Rule = (o, _ctx, limits) =>
  limits.allowedOrderTypes.includes(o.orderType)
    ? null
    : {
        rule: "order-type",
        message: `${o.orderType} not allowed — marketable-limit orders only`,
      };

/** Long-only mandate (charter Universe: "no margin" ⇒ no short selling). A short
 *  order is a hard reject — shorting requires margin, which the charter
 *  prohibits. The LLM cannot override a rail. */
export const noShorts: Rule = (o) =>
  o.side === "short"
    ? {
        rule: "no-shorts",
        message: "short selling is prohibited — long-only (no margin)",
      }
    : null;

export const universe: Rule = (o, _ctx, limits) => {
  if (!isEntry(o)) return null;
  if (!limits.allowedAssetClasses.includes(o.assetClass)) {
    return {
      rule: "universe",
      message: `${o.assetClass} is outside the universe — listed US equities only`,
    };
  }
  if (limits.excludedSymbols.includes(o.symbol)) {
    return {
      rule: "universe",
      message: `${o.symbol} is the benchmark, not a holding`,
    };
  }
  return null;
};

export const stopAttached: Rule = (o) => {
  if (!isEntry(o)) return null;
  // A no-stop sleeve (core-long, target-weight) is governed by the review-trigger
  // rail instead; the stop rail does not apply.
  if (!requiresStop(o)) return null;
  if (o.stopPrice === null) {
    return { rule: "stop-attached", message: "entry has no protective stop" };
  }
  if (o.side === "long" && o.stopPrice >= o.limitPrice) {
    return {
      rule: "stop-attached",
      message: "stop must be below the entry price for a long",
    };
  }
  if (o.side === "short" && o.stopPrice <= o.limitPrice) {
    return {
      rule: "stop-attached",
      message: "stop must be above the entry price for a short",
    };
  }
  return null;
};

export const perPositionRisk: Rule = (o, ctx, limits) => {
  if (!isEntry(o) || o.stopPrice === null) return null; // stopAttached handles a missing stop
  const riskAmount = Math.abs(o.limitPrice - o.stopPrice) * o.qty;
  const cap = limits.perPositionRiskPct * ctx.equity;
  return riskAmount > cap
    ? {
        rule: "per-position-risk",
        message: `risk to stop ${usd(riskAmount)} exceeds ${pct(
          limits.perPositionRiskPct,
        )} of equity (${usd(cap)})`,
      }
    : null;
};

export const perPositionSize: Rule = (o, ctx, limits) => {
  if (!isEntry(o)) return null;
  const exposure = heldValue(ctx, o.symbol) + o.qty * o.limitPrice;
  const cap = limits.perPositionSizePct * ctx.equity;
  return exposure > cap
    ? {
        rule: "position-size",
        message: `position size ${usd(exposure)} exceeds ${pct(
          limits.perPositionSizePct,
        )} of equity (${usd(cap)})`,
      }
    : null;
};

/** Held market value already in `sector` (excluding the order's own symbol — its
 *  exposure is added separately so adding to a held name isn't double-counted). */
const sectorHeldValue = (
  ctx: RiskContext,
  sector: string,
  symbol: string,
): number =>
  ctx.openPositions
    .filter((p) => p.sector === sector && p.symbol !== symbol)
    .reduce((sum, p) => sum + p.marketValue, 0);

/**
 * Sector-required rail — a BUY must carry a known GICS sector, so the sector
 * concentration cap can't be skipped by simply omitting the classification. A
 * buy with no sector is blocked (the human can override consciously, or refresh
 * research to classify it); a sell doesn't open new exposure, so it is exempt.
 */
export const sectorRequired: Rule = (o) => {
  if (!isEntry(o)) return null;
  return o.sector
    ? null
    : {
        rule: "sector-required",
        message:
          "buy needs a known sector — the concentration cap can't be checked without it (refresh research or set the sector)",
      };
};

/**
 * Concentration rail — at most `maxSectorWeightPct` of equity in any one sector,
 * so a 5-position book can't quietly become three correlated names. **Fails
 * open** when the order's sector is unknown (null/absent): the desk never blocks
 * on missing classification data, it only blocks a *known* over-concentration.
 */
export const sectorConcentration: Rule = (o, ctx, limits) => {
  if (!isEntry(o)) return null;
  const sector = o.sector ?? null;
  if (!sector) return null; // unknown sector → cannot fire
  const exposure =
    sectorHeldValue(ctx, sector, o.symbol) + o.qty * o.limitPrice;
  const cap = limits.maxSectorWeightPct * ctx.equity;
  return exposure > cap
    ? {
        rule: "sector-concentration",
        message: `${sector} exposure ${usd(exposure)} exceeds ${pct(
          limits.maxSectorWeightPct,
        )} of equity (${usd(cap)})`,
      }
    : null;
};

/**
 * Winner-exit discipline — every entry must define how it takes profit: a fixed
 * `takeProfit` OR a `trailingStopPct` rule, set at decision time. Mirrors
 * `stopAttached` on the downside so the desk governs winners, not just losers.
 */
export const winnerExit: Rule = (o) => {
  if (!isEntry(o)) return null;
  // A buy-and-hold core entry (no-stop sleeve) defines no profit target — it is
  // held to a target weight and reviewed on drawdown, not exited on a winner.
  if (!requiresStop(o)) return null;
  const hasTarget = o.takeProfit != null && o.takeProfit > 0;
  const hasTrailing = o.trailingStopPct != null && o.trailingStopPct > 0;
  if (hasTarget || hasTrailing) return null;
  return {
    rule: "winner-exit",
    message: "entry has no profit target or trailing-stop rule",
  };
};

/**
 * Drawdown/**review trigger** — the no-stop counterpart to `stopAttached`
 * (per-sleeve-rails M2). A `requiresStop: false` entry (core-long, target-weight)
 * has no protective stop, so it must instead define a **wide drawdown that flags
 * a human review** (not an auto-exit). The trigger must be present and within a
 * sane band (`0 < pct ≤ MAX_REVIEW_TRIGGER_PCT`). Does not apply to stop-required
 * sleeves — there the stop rail governs the downside.
 */
export const reviewTriggerAttached: Rule = (o) => {
  if (!isEntry(o)) return null;
  if (requiresStop(o)) return null; // stop-required sleeves use stopAttached
  const t = o.reviewTriggerPct;
  if (t == null || t <= 0) {
    return {
      rule: "review-trigger",
      message: "no-stop entry has no drawdown/review trigger",
    };
  }
  if (t > MAX_REVIEW_TRIGGER_PCT) {
    return {
      rule: "review-trigger",
      message: `review trigger ${pct(t)} is wider than the ${pct(
        MAX_REVIEW_TRIGGER_PCT,
      )} max`,
    };
  }
  return null;
};

export const positionCount: Rule = (o, ctx, limits) => {
  if (!isEntry(o)) return null;
  const alreadyHeld = ctx.openPositions.some((p) => p.symbol === o.symbol);
  if (alreadyHeld) return null; // adding to a held name doesn't take a new slot
  return ctx.openPositions.length >= limits.maxConcurrentPositions
    ? {
        rule: "position-count",
        message: `already at the ${limits.maxConcurrentPositions}-position limit`,
      }
    : null;
};

export const dailyOrderCap: Rule = (o, ctx, limits) =>
  ctx.ordersToday >= limits.maxOrdersPerDay
    ? {
        rule: "daily-order-cap",
        message: `daily order cap of ${limits.maxOrdersPerDay} reached`,
      }
    : null;

export const drawdownHalt: Rule = (o, ctx, limits) => {
  if (!isEntry(o)) return null;
  const haltLevel = ctx.highWaterEquity * (1 - limits.drawdownHaltPct);
  return ctx.equity <= haltLevel
    ? {
        rule: "drawdown-halt",
        message: `drawdown halt — equity ${usd(ctx.equity)} at/below the −${pct(
          limits.drawdownHaltPct,
        )} high-water level (${usd(haltLevel)})`,
      }
    : null;
};

export const emergencyStop: Rule = (o, ctx, limits) => {
  if (!isEntry(o)) return null;
  if (ctx.spyIntradayChangePct <= -limits.emergencySpyDropPct) {
    return {
      rule: "emergency-stop",
      message: `SPY ${(ctx.spyIntradayChangePct * 100).toFixed(
        1,
      )}% intraday — no new buys`,
    };
  }
  if (ctx.vix > limits.emergencyVixLevel) {
    return {
      rule: "emergency-stop",
      message: `VIX ${ctx.vix} above ${limits.emergencyVixLevel} — no new buys`,
    };
  }
  return null;
};

/** The full rail set, in a stable order. */
export const RULES: Rule[] = [
  noShorts,
  universe,
  allowedOrderType,
  stopAttached,
  winnerExit,
  reviewTriggerAttached,
  perPositionRisk,
  perPositionSize,
  sectorRequired,
  sectorConcentration,
  positionCount,
  dailyOrderCap,
  drawdownHalt,
  emergencyStop,
];

/**
 * Deterministic stop-price resolution — the charter says every entry carries a
 * predefined stop at "−8% OR an ATR-based level". To make sizing math
 * **deterministic** (not "whichever the LLM felt like"), the **tighter** of the
 * two wins: the fixed-percent stop and the ATR-multiple stop are both computed
 * from the entry, and the one closer to the entry is used (it risks less per
 * share). For a long the higher stop is tighter; for a short the lower stop is.
 * Returns the fixed stop alone when no ATR is available.
 */
export function resolveStopPrice(args: {
  entry: number;
  side: Side;
  fixedPct?: number; // default 8%
  atr?: number | null;
  atrMultiple?: number; // default 2× ATR
}): number {
  const fixedPct = args.fixedPct ?? 0.08;
  const atrMultiple = args.atrMultiple ?? 2;
  const { entry, side, atr } = args;

  const fixedStop =
    side === "long" ? entry * (1 - fixedPct) : entry * (1 + fixedPct);
  if (atr == null || atr <= 0) return fixedStop;

  const atrStop =
    side === "long" ? entry - atrMultiple * atr : entry + atrMultiple * atr;

  // The tighter stop is the one nearer the entry (smaller per-share risk).
  return side === "long"
    ? Math.max(fixedStop, atrStop)
    : Math.min(fixedStop, atrStop);
}
