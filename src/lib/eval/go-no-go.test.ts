import { describe, expect, it } from "vitest";
import {
  decideGoNoGo,
  DEFAULT_GO_NO_GO_CONFIG,
  type GoNoGoConfig,
} from "./go-no-go";

const base = {
  windowDays: 120,
  closedTrades: 25,
  netExcessAnnualizedPct: 0.03,
  strategyMaxDrawdownPct: -0.05,
  benchmarkMaxDrawdownPct: -0.07,
  railBreaches: 0,
};

describe("decideGoNoGo — sample gate", () => {
  it("is NOT-YET until both the duration and trade-count floors are met", () => {
    const r = decideGoNoGo({
      ...base,
      windowDays: 45,
      closedTrades: 11,
    });
    expect(r.verdict).toBe("NOT-YET");
    expect(r.sample.tradesMet).toBe(false);
    expect(r.sample.durationMet).toBe(false);
    expect(r.summary).toContain("11/20");
    expect(r.summary).toContain("45/90");
  });

  it("is NOT-YET when trades are met but the window is too short", () => {
    const r = decideGoNoGo({ ...base, windowDays: 30, closedTrades: 25 });
    expect(r.verdict).toBe("NOT-YET");
    expect(r.sample.tradesMet).toBe(true);
    expect(r.sample.durationMet).toBe(false);
  });

  it("is NOT-YET when the window is met but too few trades closed", () => {
    const r = decideGoNoGo({ ...base, windowDays: 120, closedTrades: 5 });
    expect(r.verdict).toBe("NOT-YET");
  });
});

describe("decideGoNoGo — GO", () => {
  it("is GO when net excess > 0, drawdown ≤ SPY, and zero breaches", () => {
    const r = decideGoNoGo(base);
    expect(r.verdict).toBe("GO");
    expect(r.failedCriterion).toBeNull();
    expect(r.sample.sampleMet).toBe(true);
  });
});

describe("decideGoNoGo — NO-GO", () => {
  it("is NO-GO naming the returns criterion when it trails SPY net-of-cost", () => {
    const r = decideGoNoGo({ ...base, netExcessAnnualizedPct: -0.01 });
    expect(r.verdict).toBe("NO-GO");
    expect(r.failedCriterion).toMatch(/excess/i);
  });

  it("is NO-GO when net excess is exactly at the margin (must beat it)", () => {
    const r = decideGoNoGo({ ...base, netExcessAnnualizedPct: 0 });
    expect(r.verdict).toBe("NO-GO");
    expect(r.failedCriterion).toMatch(/excess/i);
  });

  it("is NO-GO naming drawdown when the strategy drew down worse than SPY", () => {
    const r = decideGoNoGo({
      ...base,
      strategyMaxDrawdownPct: -0.2,
      benchmarkMaxDrawdownPct: -0.07,
    });
    expect(r.verdict).toBe("NO-GO");
    expect(r.failedCriterion).toMatch(/drawdown/i);
  });

  it("uses a configured drawdown cap instead of SPY when set", () => {
    const config: GoNoGoConfig = {
      ...DEFAULT_GO_NO_GO_CONFIG,
      maxDrawdownCapPct: -0.15,
    };
    // Strategy −0.20 is worse than SPY −0.07 but the explicit cap is −0.15.
    const r = decideGoNoGo({
      ...base,
      strategyMaxDrawdownPct: -0.2,
      benchmarkMaxDrawdownPct: -0.07,
      config,
    });
    expect(r.verdict).toBe("NO-GO");
    expect(r.drawdownCapPct).toBe(-0.15);
    expect(r.failedCriterion).toMatch(/drawdown/i);

    // Within the cap → passes that criterion.
    const ok = decideGoNoGo({
      ...base,
      strategyMaxDrawdownPct: -0.12,
      benchmarkMaxDrawdownPct: -0.07,
      config,
    });
    expect(ok.verdict).toBe("GO");
  });

  it("is NO-GO naming the rails when a hard rail was breached", () => {
    const r = decideGoNoGo({ ...base, railBreaches: 2 });
    expect(r.verdict).toBe("NO-GO");
    expect(r.failedCriterion).toMatch(/rail/i);
  });

  it("is NO-GO when net excess vs SPY is unavailable (can't prove the edge)", () => {
    const r = decideGoNoGo({ ...base, netExcessAnnualizedPct: null });
    expect(r.verdict).toBe("NO-GO");
    expect(r.failedCriterion).toMatch(/unavailable/i);
  });
});

describe("DEFAULT_GO_NO_GO_CONFIG", () => {
  it("defaults to ≥3 months, ≥20 trades, >0 excess margin, SPY-relative drawdown", () => {
    expect(DEFAULT_GO_NO_GO_CONFIG.minMonths).toBe(3);
    expect(DEFAULT_GO_NO_GO_CONFIG.minClosedTrades).toBe(20);
    expect(DEFAULT_GO_NO_GO_CONFIG.minNetExcessAnnualizedPct).toBe(0);
    expect(DEFAULT_GO_NO_GO_CONFIG.maxDrawdownCapPct).toBeNull();
  });
});
