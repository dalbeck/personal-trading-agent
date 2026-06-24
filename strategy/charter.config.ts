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
