import type {
  ProposedOrder,
  RiskContext,
  RiskLimits,
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
  universe,
  allowedOrderType,
  stopAttached,
  perPositionRisk,
  perPositionSize,
  positionCount,
  dailyOrderCap,
  drawdownHalt,
  emergencyStop,
];
