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
}

/** A currently-open holding (only the fields the rails need). */
export interface HeldPosition {
  symbol: string;
  marketValue: number;
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
