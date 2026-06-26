/**
 * Types for the risk engine (`src/lib/risk`). Pure data — no I/O, no secrets —
 * so the validators can be unit-tested in isolation and reused by the engine.
 */

export type OrderAction = "buy" | "sell";
export type Side = "long" | "short";
export type AssetClass = "equity" | "option" | "crypto" | "future";
export type OrderType =
  | "marketable_limit"
  | "limit"
  | "market"
  | "stop"
  | "stop_limit";

/** A proposed order presented to the risk gate before it can be placed. */
export interface ProposedOrder {
  symbol: string;
  action: OrderAction;
  side: Side;
  qty: number;
  limitPrice: number;
  orderType: OrderType;
  stopPrice: number | null;
  assetClass: AssetClass;
  /** Profit target for the winner-exit rule. An entry must define a profit
   *  target OR a trailing-stop rule. Null when neither is set. */
  takeProfit?: number | null;
  /** Trailing-stop distance as a fraction (0.08 === 8% trail) — the alternative
   *  to a fixed `takeProfit` for the winner-exit rule. Null when not used. */
  trailingStopPct?: number | null;
  /** GICS-style sector for the concentration rail (e.g. "Technology"). Null/
   *  absent when unknown — the sector rail then cannot fire (fails open). */
  sector?: string | null;
}

/** A currently-open holding (only the fields the rails need). */
export interface HeldPosition {
  symbol: string;
  marketValue: number;
  /** Sector of the holding for the concentration rail; null/absent when unknown
   *  (that holding simply doesn't count toward any sector sum). */
  sector?: string | null;
}

/** Account + market state at decision time. */
export interface RiskContext {
  equity: number;
  highWaterEquity: number;
  openPositions: HeldPosition[];
  ordersToday: number;
  /** SPY intraday change as a fraction: -0.025 === SPY −2.5%. */
  spyIntradayChangePct: number;
  vix: number;
}

/** The machine-readable mirror of the charter's numeric limits. */
export interface RiskLimits {
  perPositionRiskPct: number;
  perPositionSizePct: number;
  /** Max fraction of equity in any single GICS sector — the concentration rail,
   *  so a 5-position book can't be three correlated names. */
  maxSectorWeightPct: number;
  maxConcurrentPositions: number;
  maxOrdersPerDay: number;
  drawdownHaltPct: number;
  emergencySpyDropPct: number;
  emergencyVixLevel: number;
  allowedOrderTypes: OrderType[];
  allowedAssetClasses: AssetClass[];
  excludedSymbols: string[];
}

export interface Violation {
  /** Stable rule id, e.g. "position-size" — used for journaling rejections. */
  rule: string;
  message: string;
}

export interface RiskDecision {
  ok: boolean;
  violations: Violation[];
}
