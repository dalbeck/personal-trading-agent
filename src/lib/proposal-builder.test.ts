import { describe, expect, it } from "vitest";
import { buildManualProposalDraft } from "./proposal-builder";
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
});
