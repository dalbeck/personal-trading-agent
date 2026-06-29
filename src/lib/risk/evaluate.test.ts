import { describe, expect, it } from "vitest";
import {
  railsForSleeve,
  sleeveRequiresStop,
} from "@strategy/sleeves.config";
import { evaluateOrder, resolveStopPrice } from "./index";
import { sizeByTargetWeight } from "./sizing";
import type { ProposedOrder, RiskContext } from "./types";

/**
 * The risk engine is the hard gate every proposed order passes before it can be
 * placed. These are boundary tests for each charter rail, exercised through the
 * public `evaluateOrder` against the real `strategy/charter.config.ts` limits.
 * A failing rail must block the order (`ok: false`) and name itself in
 * `violations[].rule`.
 */

// A clean buy that satisfies every rail: $15k notional (15% of $100k), $300 risk
// to a stop below entry (0.3%), equity at the high-water mark, calm market.
function baseOrder(over: Partial<ProposedOrder> = {}): ProposedOrder {
  return {
    symbol: "AAPL",
    action: "buy",
    side: "long",
    qty: 100,
    limitPrice: 150,
    orderType: "marketable_limit",
    stopPrice: 147,
    takeProfit: 170,
    assetClass: "equity",
    ...over,
  };
}

function baseCtx(over: Partial<RiskContext> = {}): RiskContext {
  return {
    equity: 100_000,
    highWaterEquity: 100_000,
    openPositions: [],
    ordersToday: 0,
    spyIntradayChangePct: 0,
    vix: 15,
    ...over,
  };
}

const rules = (o: ProposedOrder, c: RiskContext) =>
  evaluateOrder(o, c).violations.map((v) => v.rule);

describe("evaluateOrder — a compliant order", () => {
  it("passes every rail", () => {
    const decision = evaluateOrder(baseOrder(), baseCtx());
    expect(decision).toEqual({ ok: true, violations: [] });
  });
});

describe("per-sleeve rails — no-stop core-long order (per-sleeve-rails M2)", () => {
  const coreLimits = railsForSleeve("core-long");

  // A target-weight core buy: no stop, no profit target, carries a review trigger.
  function coreOrder(over: Partial<ProposedOrder> = {}): ProposedOrder {
    const qty = sizeByTargetWeight({
      equity: 100_000,
      entry: 400,
      targetWeightPct: 0.4,
      perPositionSizePct: coreLimits.perPositionSizePct,
    });
    return baseOrder({
      symbol: "BRK.B",
      qty,
      limitPrice: 400,
      stopPrice: null,
      takeProfit: null,
      requiresStop: sleeveRequiresStop("core-long"), // false
      reviewTriggerPct: 0.25,
      targetWeightPct: 0.4,
      ...over,
    });
  }

  it("sizes correctly and passes every rail with no stop and no target", () => {
    const decision = evaluateOrder(coreOrder(), baseCtx(), coreLimits);
    expect(decision).toEqual({ ok: true, violations: [] });
  });

  it("requires a drawdown/review trigger when there is no stop", () => {
    expect(
      evaluateOrder(coreOrder({ reviewTriggerPct: null }), baseCtx(), coreLimits)
        .violations.map((v) => v.rule),
    ).toContain("review-trigger");
  });

  it("rejects a review trigger wider than the sane band", () => {
    expect(
      evaluateOrder(coreOrder({ reviewTriggerPct: 0.9 }), baseCtx(), coreLimits)
        .violations.map((v) => v.rule),
    ).toContain("review-trigger");
  });

  it("the target weight stays within the sleeve size cap", () => {
    const o = coreOrder();
    expect(o.qty * o.limitPrice).toBeLessThanOrEqual(
      coreLimits.perPositionSizePct * 100_000 + 1e-6,
    );
  });
});

describe("per-sleeve rails — a stopless entry is still rejected for stop sleeves", () => {
  it("swing entry without a stop is rejected (stop required)", () => {
    expect(
      rules(baseOrder({ stopPrice: null, requiresStop: true }), baseCtx()),
    ).toContain("stop-attached");
  });

  it("mid entry without a stop is rejected (position-mid requires a stop)", () => {
    // position-mid carries requiresStop: true → the stop rail still fires.
    expect(sleeveRequiresStop("position-mid")).toBe(true);
    expect(
      evaluateOrder(
        baseOrder({ stopPrice: null, requiresStop: true }),
        baseCtx(),
        railsForSleeve("position-mid"),
      ).violations.map((v) => v.rule),
    ).toContain("stop-attached");
  });

  it("a no-stop sleeve does NOT get the review-trigger rail on stop sleeves", () => {
    // Sanity: a normal swing order (requiresStop default) never trips review-trigger.
    expect(rules(baseOrder(), baseCtx())).not.toContain("review-trigger");
  });
});

describe("winner-exit discipline (M3)", () => {
  it("blocks an entry with no profit target or trailing-stop rule", () => {
    expect(rules(baseOrder({ takeProfit: null }), baseCtx())).toContain(
      "winner-exit",
    );
  });

  it("passes when a trailing-stop rule stands in for a fixed target", () => {
    expect(
      rules(baseOrder({ takeProfit: null, trailingStopPct: 0.08 }), baseCtx()),
    ).not.toContain("winner-exit");
  });

  it("never blocks an exit (sell) for lacking a target", () => {
    expect(
      rules(baseOrder({ action: "sell", stopPrice: null, takeProfit: null }), baseCtx()),
    ).not.toContain("winner-exit");
  });
});

describe("sector concentration rail (M3)", () => {
  // A $40k entry (40% of $100k) is exactly at the cap; held same-sector value
  // tips it over.
  it("blocks when the new order tips a sector over 40% of equity", () => {
    const order = baseOrder({
      symbol: "NVDA",
      qty: 200,
      limitPrice: 150, // $30k
      sector: "Technology",
    });
    const ctx = baseCtx({
      openPositions: [
        { symbol: "MSFT", marketValue: 15_000, sector: "Technology" },
      ],
    });
    // $30k + $15k = $45k > $40k cap.
    expect(rules(order, ctx)).toContain("sector-concentration");
  });

  it("does not fire when the combined sector exposure is within the cap", () => {
    const order = baseOrder({ symbol: "NVDA", qty: 100, limitPrice: 150, sector: "Technology" });
    const ctx = baseCtx({
      openPositions: [
        { symbol: "MSFT", marketValue: 15_000, sector: "Technology" },
      ],
    });
    // $15k + $15k = $30k < $40k cap.
    expect(rules(order, ctx)).not.toContain("sector-concentration");
  });

  it("fails OPEN when the order's sector is unknown (never a false block)", () => {
    const order = baseOrder({ qty: 200, limitPrice: 150, sector: null });
    const ctx = baseCtx({
      openPositions: [
        { symbol: "MSFT", marketValue: 30_000, sector: "Technology" },
      ],
    });
    expect(rules(order, ctx)).not.toContain("sector-concentration");
  });

  it("counts only same-sector holdings, not the whole book", () => {
    const order = baseOrder({ symbol: "NVDA", qty: 200, limitPrice: 150, sector: "Technology" });
    const ctx = baseCtx({
      openPositions: [
        { symbol: "XOM", marketValue: 30_000, sector: "Energy" },
      ],
    });
    // $30k Tech entry + $0 same-sector held = under cap (Energy doesn't count).
    expect(rules(order, ctx)).not.toContain("sector-concentration");
  });
});

describe("resolveStopPrice — deterministic 8%-vs-ATR priority (M3)", () => {
  it("uses the fixed 8% stop when no ATR is available", () => {
    expect(resolveStopPrice({ entry: 100, side: "long" })).toBeCloseTo(92);
    expect(resolveStopPrice({ entry: 100, side: "short" })).toBeCloseTo(108);
  });

  it("picks the TIGHTER of fixed-% and ATR for a long (higher stop wins)", () => {
    // ATR 2 × 2 = $4 → ATR stop $96, tighter than the 8% stop ($92).
    expect(
      resolveStopPrice({ entry: 100, side: "long", atr: 2, atrMultiple: 2 }),
    ).toBeCloseTo(96);
    // Wide ATR ($10 × 2 = $20 → $80) is looser than 8% ($92) → 8% wins.
    expect(
      resolveStopPrice({ entry: 100, side: "long", atr: 10, atrMultiple: 2 }),
    ).toBeCloseTo(92);
  });

  it("picks the TIGHTER of fixed-% and ATR for a short (lower stop wins)", () => {
    // ATR stop $104 is tighter than the 8% stop ($108).
    expect(
      resolveStopPrice({ entry: 100, side: "short", atr: 2, atrMultiple: 2 }),
    ).toBeCloseTo(104);
  });
});

describe("allowed order type", () => {
  it("blocks a naked market order", () => {
    expect(rules(baseOrder({ orderType: "market" }), baseCtx())).toContain(
      "order-type",
    );
  });
  it("blocks a stop-limit order", () => {
    expect(rules(baseOrder({ orderType: "stop_limit" }), baseCtx())).toContain(
      "order-type",
    );
  });
});

describe("universe", () => {
  it("blocks non-equity asset classes", () => {
    for (const assetClass of ["option", "crypto", "future"] as const) {
      expect(rules(baseOrder({ assetClass }), baseCtx())).toContain("universe");
    }
  });
  it("blocks buying the SPY benchmark", () => {
    expect(rules(baseOrder({ symbol: "SPY" }), baseCtx())).toContain("universe");
  });
});

describe("stop attached", () => {
  it("blocks an entry with no protective stop", () => {
    expect(rules(baseOrder({ stopPrice: null }), baseCtx())).toContain(
      "stop-attached",
    );
  });
  it("blocks a long entry whose stop is at/above the entry price", () => {
    expect(rules(baseOrder({ stopPrice: 150 }), baseCtx())).toContain(
      "stop-attached",
    );
  });
});

describe("per-position risk (2%)", () => {
  it("allows risk exactly at the 2% cap", () => {
    // entry 150, stop 130 → $20/sh × 100 = $2,000 = 2% of $100k.
    expect(rules(baseOrder({ stopPrice: 130 }), baseCtx())).not.toContain(
      "per-position-risk",
    );
  });
  it("blocks risk just over the cap", () => {
    expect(rules(baseOrder({ stopPrice: 129.99 }), baseCtx())).toContain(
      "per-position-risk",
    );
  });
});

describe("per-position size (20%)", () => {
  it("allows size exactly at the 20% cap", () => {
    // 133 × $150 = $19,950 ≤ $20,000.
    expect(rules(baseOrder({ qty: 133 }), baseCtx())).not.toContain(
      "position-size",
    );
  });
  it("blocks size over the cap", () => {
    // 140 × $150 = $21,000 > $20,000.
    expect(rules(baseOrder({ qty: 140 }), baseCtx())).toContain("position-size");
  });
  it("counts existing exposure in the same name", () => {
    const ctx = baseCtx({
      openPositions: [{ symbol: "AAPL", marketValue: 10_000 }],
    });
    // held $10k + new $15k = $25k > $20k.
    expect(rules(baseOrder(), ctx)).toContain("position-size");
  });
});

describe("position count (5)", () => {
  const five = Array.from({ length: 5 }, (_, i) => ({
    symbol: `SYM${i}`,
    marketValue: 1_000,
  }));
  it("blocks a new name once 5 positions are open", () => {
    expect(rules(baseOrder(), baseCtx({ openPositions: five }))).toContain(
      "position-count",
    );
  });
  it("allows adding to an already-held name at the limit", () => {
    const held = [...five.slice(0, 4), { symbol: "AAPL", marketValue: 1_000 }];
    expect(rules(baseOrder(), baseCtx({ openPositions: held }))).not.toContain(
      "position-count",
    );
  });
  it("allows a new name with 4 open", () => {
    expect(
      rules(baseOrder(), baseCtx({ openPositions: five.slice(0, 4) })),
    ).not.toContain("position-count");
  });
});

describe("daily order cap (6)", () => {
  it("allows the 6th order of the day", () => {
    expect(rules(baseOrder(), baseCtx({ ordersToday: 5 }))).not.toContain(
      "daily-order-cap",
    );
  });
  it("blocks once 6 orders are already placed", () => {
    expect(rules(baseOrder(), baseCtx({ ordersToday: 6 }))).toContain(
      "daily-order-cap",
    );
  });
});

describe("drawdown halt (−10% from high-water)", () => {
  it("blocks new buys at/below the halt level", () => {
    const ctx = baseCtx({ equity: 90_000, highWaterEquity: 100_000 });
    expect(rules(baseOrder(), ctx)).toContain("drawdown-halt");
  });
  it("allows buys above the halt level", () => {
    const ctx = baseCtx({ equity: 91_000, highWaterEquity: 100_000 });
    expect(rules(baseOrder(), ctx)).not.toContain("drawdown-halt");
  });
  it("still allows an exit (sell) during a halt", () => {
    const ctx = baseCtx({ equity: 80_000, highWaterEquity: 100_000 });
    const sell = baseOrder({ action: "sell", stopPrice: null });
    expect(evaluateOrder(sell, ctx).ok).toBe(true);
  });
});

describe("emergency stop (SPY −2% or VIX > 30)", () => {
  it("blocks new buys when SPY is down 2% intraday", () => {
    expect(
      rules(baseOrder(), baseCtx({ spyIntradayChangePct: -0.02 })),
    ).toContain("emergency-stop");
  });
  it("allows buys when SPY is down only 1.9%", () => {
    expect(
      rules(baseOrder(), baseCtx({ spyIntradayChangePct: -0.019 })),
    ).not.toContain("emergency-stop");
  });
  it("allows buys at VIX exactly 30 but blocks above 30", () => {
    expect(rules(baseOrder(), baseCtx({ vix: 30 }))).not.toContain(
      "emergency-stop",
    );
    expect(rules(baseOrder(), baseCtx({ vix: 30.5 }))).toContain(
      "emergency-stop",
    );
  });
  it("still allows an exit (sell) during an emergency stop", () => {
    const sell = baseOrder({ action: "sell", stopPrice: null });
    expect(evaluateOrder(sell, baseCtx({ vix: 40 })).ok).toBe(true);
  });
});

describe("aggregate", () => {
  it("collects every violation for a maximally bad order", () => {
    const bad = baseOrder({
      assetClass: "option",
      orderType: "market",
      stopPrice: null,
    });
    const decision = evaluateOrder(bad, baseCtx());
    expect(decision.ok).toBe(false);
    expect(decision.violations.map((v) => v.rule)).toEqual(
      expect.arrayContaining(["universe", "order-type", "stop-attached"]),
    );
  });
});
