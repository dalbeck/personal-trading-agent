import { describe, expect, it } from "vitest";
import {
  buildCoreLongProposalDraft,
  buildManualProposalDraft,
} from "./proposal-builder";
import type { Ohlc } from "./indicators";

/** A daily series that ramps from `start` by `step`/day over `n` days. Each bar
 *  is a tight ±0.5 range around the close, with a fixed volume unless given. */
function ramp(
  n: number,
  start: number,
  step: number,
  vol: (i: number) => number = () => 1_000_000,
): Ohlc[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    return { o: c - 0.2, h: c + 0.5, l: c - 0.5, c, v: vol(i), t: `d${i}` };
  });
}

describe("buildManualProposalDraft", () => {
  it("builds a long buy entered at the last close with a protective stop and a >=2:1 target", () => {
    const bars = ramp(60, 50, 1); // last close = 50 + 59 = 109
    const draft = buildManualProposalDraft({
      symbol: "TEST",
      bars,
      equity: 10_000,
    });
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.action).toBe("buy");
    expect(draft.side).toBe("long");
    expect(draft.limitPrice).toBeCloseTo(109, 6);
    // Stop is below entry (long) and target above it.
    expect(draft.stopPrice).not.toBeNull();
    expect(draft.stopPrice as number).toBeLessThan(draft.limitPrice);
    expect(draft.takeProfit as number).toBeGreaterThan(draft.limitPrice);
    // Reward/risk is at least ~2:1.
    const rr =
      ((draft.takeProfit as number) - draft.limitPrice) /
      (draft.limitPrice - (draft.stopPrice as number));
    expect(rr).toBeGreaterThanOrEqual(1.99);
  });

  it("anchors entry/stop/target/sizing to the current quote, not the last bar close (fresh-levels M1)", () => {
    const bars = ramp(60, 50, 1); // last close = 109
    // The market has since traded down to 102 — the entry must follow the quote.
    const draft = buildManualProposalDraft({
      symbol: "TEST",
      bars,
      equity: 10_000,
      quote: 102,
    });
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.limitPrice).toBeCloseTo(102, 6);
    // Stop + sizing are computed off the live anchor, not the stale 109.
    expect(draft.stopPrice as number).toBeLessThan(102);
    const riskPerShare = 102 - (draft.stopPrice as number);
    expect(draft.qty * riskPerShare).toBeLessThanOrEqual(10_000 * 0.02 + 1e-6);
  });

  it("falls back to the last bar close when no live quote is given", () => {
    const bars = ramp(60, 50, 1);
    const draft = buildManualProposalDraft({ symbol: "TEST", bars, equity: 10_000 });
    expect(draft?.limitPrice).toBeCloseTo(109, 6);
  });

  it("ignores a non-positive quote and falls back to the last close", () => {
    const bars = ramp(60, 50, 1);
    const draft = buildManualProposalDraft({
      symbol: "TEST",
      bars,
      equity: 10_000,
      quote: 0,
    });
    expect(draft?.limitPrice).toBeCloseTo(109, 6);
  });

  it("sizes stop-first within the 2% risk and 20% size caps", () => {
    const bars = ramp(60, 50, 1);
    const draft = buildManualProposalDraft({
      symbol: "TEST",
      bars,
      equity: 10_000,
    });
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.qty).toBeGreaterThan(0);
    // ≤ 2% of equity at risk to the stop.
    const riskDollars = draft.qty * (draft.limitPrice - (draft.stopPrice as number));
    expect(riskDollars).toBeLessThanOrEqual(10_000 * 0.02 + 1e-6);
    // ≤ 20% of equity in the position.
    expect(draft.qty * draft.limitPrice).toBeLessThanOrEqual(10_000 * 0.2 + 1e-6);
    // riskPct field agrees with the sizing.
    expect(draft.riskPct).toBeCloseTo(riskDollars / 10_000, 6);
  });

  it("scores an uptrend higher-conviction than a downtrend", () => {
    const up = buildManualProposalDraft({
      symbol: "UP",
      bars: ramp(220, 50, 0.5),
      equity: 10_000,
    });
    const down = buildManualProposalDraft({
      symbol: "DN",
      bars: ramp(220, 160, -0.5),
      equity: 10_000,
    });
    expect(up).not.toBeNull();
    expect(down).not.toBeNull();
    if (!up || !down) return;
    expect(up.convictionScore as number).toBeGreaterThan(
      down.convictionScore as number,
    );
  });

  it("penalizes + caps value conviction below 'high' when cash-flow quality is unknown (conviction-honesty M1)", () => {
    // A deep-discount value setup with a covered dividend that WOULD score high…
    const base = {
      symbol: "JKHY",
      bars: ramp(220, 200, -0.3), // long downtrend → cheap vs the 200-day
      equity: 10_000,
      strategy: "value" as const,
      catalyst: "Dividend floor: FCF covers 2.4×, 14-yr growth streak",
      catalystType: "other" as const,
      dividendFloor: { covered: true, atRisk: false },
    };
    const known = buildManualProposalDraft({ ...base, qualityDataKnown: true });
    const unknown = buildManualProposalDraft({ ...base, qualityDataKnown: false });
    expect(known).not.toBeNull();
    expect(unknown).not.toBeNull();
    if (!known || !unknown) return;

    // Unknown cash-flow measurably lowers the score…
    expect(unknown.convictionScore).toBeLessThan(known.convictionScore);
    // …and caps the tier below "high" — never high-conviction without the data.
    expect(unknown.convictionTier).not.toBe("high");
    expect(unknown.convictionScore).toBeLessThan(0.7);
  });

  it("anchors the target on the prior high when that gives a >=2:1 reward", () => {
    // A long base then a pullback: the prior high sits well above the last close.
    const base = ramp(40, 100, 0); // flat at 100
    const spike: Ohlc[] = [{ o: 100, h: 150, l: 100, c: 120, v: 1_000_000, t: "x" }];
    const pull = ramp(40, 100, 0); // back to ~100
    const draft = buildManualProposalDraft({
      symbol: "PH",
      bars: [...base, ...spike, ...pull],
      equity: 10_000,
    });
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.targetType).toBe("prior_high");
    expect(draft.takeProfit as number).toBeCloseTo(150, 6);
  });

  it("falls back to a measured-move target when no prior high gives 2:1", () => {
    const bars = ramp(60, 50, 1); // steadily rising, last close 109, high ~109.5
    const draft = buildManualProposalDraft({
      symbol: "MM",
      bars,
      equity: 10_000,
    });
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.targetType).toBe("measured_move");
  });

  it("carries sector + catalyst through to the draft", () => {
    const draft = buildManualProposalDraft({
      symbol: "CAT",
      bars: ramp(60, 50, 1),
      equity: 10_000,
      sector: "Financials",
      catalyst: "Guidance raised on NIM expansion",
      catalystType: "guidance",
    });
    expect(draft?.sector).toBe("Financials");
    expect(draft?.catalyst).toBe("Guidance raised on NIM expansion");
    expect(draft?.catalystType).toBe("guidance");
  });

  it("returns null for insufficient history, non-positive equity, or no price", () => {
    expect(
      buildManualProposalDraft({ symbol: "X", bars: ramp(10, 50, 1), equity: 10_000 }),
    ).toBeNull();
    expect(
      buildManualProposalDraft({ symbol: "X", bars: ramp(60, 50, 1), equity: 0 }),
    ).toBeNull();
  });

  it("defaults to the trend strategy and stamps it on the draft", () => {
    const draft = buildManualProposalDraft({
      symbol: "TREND",
      bars: ramp(60, 50, 1),
      equity: 10_000,
    });
    expect(draft?.strategy).toBe("trend");
  });

  describe("value / mean-reversion lens (M1)", () => {
    // A long DOWNTREND — price well below its moving averages. Under the trend
    // lens this is a weak, counter-trend pick; under value it is the *discount*.
    const downtrend = ramp(220, 160, -0.5); // falling series, last close ~50

    it("stamps strategy: value and frames counter-trend as expected, not a caution", () => {
      const draft = buildManualProposalDraft({
        symbol: "KR",
        bars: downtrend,
        equity: 10_000,
        strategy: "value",
        catalyst: "Dividend hike + insider buying",
        catalystType: "guidance",
      });
      expect(draft).not.toBeNull();
      expect(draft?.strategy).toBe("value");
      expect(draft?.thesis).toMatch(/value \/ mean-reversion/i);
      expect(draft?.thesis).not.toMatch(/counter-trend — caution/);
    });

    it("does NOT tank conviction for being below the moving averages (value scores higher than trend here)", () => {
      const common = { symbol: "KR", bars: downtrend, equity: 10_000 } as const;
      const trend = buildManualProposalDraft({ ...common, strategy: "trend" });
      const value = buildManualProposalDraft({ ...common, strategy: "value" });
      expect(trend).not.toBeNull();
      expect(value).not.toBeNull();
      // Same below-MA setup: the trend lens penalizes it, the value lens rewards
      // the discount — so value's conviction is strictly higher here.
      expect(value!.convictionScore).toBeGreaterThan(trend!.convictionScore);
    });
  });
});

describe("buildCoreLongProposalDraft (core-long M3)", () => {
  it("sizes by target weight, carries no stop, and sets a review trigger", () => {
    const d = buildCoreLongProposalDraft({
      symbol: "VOO",
      bars: ramp(60, 400, 1),
      quote: 459,
      equity: 10_000,
      targetWeightPct: 0.4,
      reviewTriggerPct: 0.25,
      perPositionSizePct: 0.6,
      allowFractional: false,
    });
    expect(d).not.toBeNull();
    expect(d!.sleeve).toBe("core-long");
    expect(d!.stopPrice).toBeNull();
    expect(d!.takeProfit).toBeNull();
    expect(d!.targetWeightPct).toBe(0.4);
    expect(d!.reviewTriggerPct).toBe(0.25);
    expect(d!.riskPct).toBe(0);
    // 40% of 10k = 4000 / 459 = 8.71 → floored to 8 whole shares.
    expect(d!.qty).toBe(8);
  });

  it("clamps the target weight to the sleeve size cap", () => {
    const d = buildCoreLongProposalDraft({
      symbol: "VTI",
      bars: ramp(60, 200, 0.5),
      quote: 230,
      equity: 10_000,
      targetWeightPct: 0.9, // over the 60% cap
      perPositionSizePct: 0.6,
      allowFractional: false,
    });
    expect(d!.targetWeightPct).toBe(0.6);
    expect(d!.qty * d!.limitPrice).toBeLessThanOrEqual(0.6 * 10_000);
  });

  it("defaults the review trigger to −25% when omitted", () => {
    const d = buildCoreLongProposalDraft({
      symbol: "VOO",
      bars: ramp(60, 400, 1),
      quote: 459,
      equity: 10_000,
      targetWeightPct: 0.3,
      perPositionSizePct: 0.6,
    });
    expect(d!.reviewTriggerPct).toBe(0.25);
  });

  it("returns null without enough history or a target weight", () => {
    expect(
      buildCoreLongProposalDraft({
        symbol: "VOO",
        bars: ramp(10, 400, 1),
        equity: 10_000,
        targetWeightPct: 0.4,
        perPositionSizePct: 0.6,
      }),
    ).toBeNull();
    expect(
      buildCoreLongProposalDraft({
        symbol: "VOO",
        bars: ramp(60, 400, 1),
        equity: 10_000,
        targetWeightPct: 0,
        perPositionSizePct: 0.6,
      }),
    ).toBeNull();
  });
});
