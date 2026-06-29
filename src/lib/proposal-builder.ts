import {
  CONVICTION_UNKNOWN_QUALITY_CAP,
  CONVICTION_UNKNOWN_QUALITY_DRAG,
  convictionTierFromScore,
  type ConvictionTier,
} from "./conviction";
import { atr, sma, type Ohlc } from "./indicators";
import { resolveStopPrice } from "./risk/validators";
import { sizeRiskToStop, sizeByTargetWeight } from "./risk/sizing";
import { resolveCatalystState } from "./catalyst-state";
import { MIN_REWARD_RISK } from "./risk-reward";
import type { Strategy } from "./strategy";
import type { CatalystState } from "./types";
import { computeRelativeVolume } from "./volume";

/**
 * Pure technical proposal builder for the manual "analyze a symbol" pipeline
 * (M2). Given a symbol's Alpaca daily bars and the active book's equity, it
 * derives a complete **review-candidate** proposal the same way the desk's
 * playbook reasons: a technically-anchored entry / stop / target, stop-first
 * sizing inside the charter caps, a relative-volume read, and a composite
 * conviction score + tier.
 *
 * It is **deterministic and pure** (no I/O) so it is fully unit-tested; the
 * server orchestration (`src/lib/server/analyze-symbol.ts`) feeds it the fetched
 * bars + research and then runs the **risk rails + red-team** over the result —
 * the builder never bypasses a gate. Fundamentals (sector / catalyst) come from
 * research and are only a catalyst-check, never the primary rationale (charter).
 */

const MIN_BARS = 30; // enough history for a meaningful ATR + trend read
const ATR_PERIOD = 14;
const DEFAULT_RISK_PCT = 0.02; // ≤ 2% of equity at risk to the stop (charter)
const DEFAULT_SIZE_PCT = 0.2; // ≤ 20% of equity in one name (charter)

export type BuilderCatalystType =
  | "earnings_momentum"
  | "product_news"
  | "sector_rotation"
  | "guidance"
  | "other"
  | "none";

export interface BuildManualProposalInput {
  symbol: string;
  /** Daily OHLCV bars, oldest → newest (Alpaca). */
  bars: Ohlc[];
  /** The **current** Alpaca quote (fresh-entry-levels M1) — the entry/stop/target/
   *  sizing anchor. A marketable-limit entry sits at/near the live quote, never a
   *  stale daily-bar close. Falls back to the last bar close when absent or
   *  non-positive (older callers, no live quote). */
  quote?: number | null;
  /** Active book equity the position is sized against. */
  equity: number;
  /** Which mandate the human is analyzing under (value-sleeve M1). `trend`
   *  (default) scores the playbook's trend signals; `value` scores a value /
   *  mean-reversion lens where being below the moving averages is the *discount*,
   *  not a penalty. Drives the conviction score + the thesis wording; the
   *  stop-first sizing + hard caps are shared and unchanged. */
  strategy?: Strategy;
  sector?: string | null;
  catalyst?: string | null;
  catalystType?: BuilderCatalystType | null;
  /** The catalyst capture state (catalyst-state-honesty M2) — drives the thesis
   *  wording so a failed fetch reads "data unavailable", not a flat "no catalyst".
   *  Null/absent → derived from catalyst presence (older callers). */
  catalystState?: CatalystState | null;
  /** Dividend floor signal for the VALUE lens (dividend-floor M1) — a durable,
   *  well-covered dividend lifts conviction; an uncovered / at-risk one drags.
   *  Ignored for trend. Null/absent when there's no dividend signal. */
  dividendFloor?: { covered: boolean; atRisk: boolean } | null;
  /** Whether the VALUE lens's key quality data (cash-flow) is KNOWN
   *  (conviction-honesty M1). Unknown is a **penalty, not neutral**: it drags the
   *  value conviction AND caps it below "high" — a value play whose cash flow we
   *  can't verify is never high-conviction. Defaults to true (back-compat / trend). */
  qualityDataKnown?: boolean;
  /** Fractional shares allowed (charter: yes). Default true. */
  allowFractional?: boolean;
  riskLimits?: { perPositionRiskPct?: number; perPositionSizePct?: number };
  /** The fixed-percent stop band for the risk-to-stop stop (position-mid M4) — the
   *  tighter of this and the 2×ATR level wins. Defaults to the swing 8%; the mid
   *  sleeve passes a wider band (12%) for a longer hold. Swing is unchanged. */
  stopBandPct?: number;
}

/** The author-set proposal fields the builder produces (the writer stamps id /
 *  account / advisory / status / origin / redTeam). */
export interface ManualProposalDraft {
  symbol: string;
  action: "buy";
  side: "long";
  strategy: Strategy;
  qty: number;
  limitPrice: number;
  stopPrice: number;
  takeProfit: number;
  targetType: "prior_high" | "measured_move";
  sector: string | null;
  relativeVolume: number | null;
  catalyst: string | null;
  catalystType: BuilderCatalystType | null;
  convictionScore: number;
  convictionTier: ConvictionTier;
  riskPct: number;
  confidence: number;
  thesis: string;
  reasoning: string;
}

export function buildManualProposalDraft(
  input: BuildManualProposalInput,
): ManualProposalDraft | null {
  const { bars, equity } = input;
  if (bars.length < MIN_BARS || !(equity > 0)) return null;

  // Anchor to the CURRENT quote (fresh-entry-levels M1) so the stop / target /
  // R:R / sizing are computed off the live price, not a stale daily-bar close.
  // Fall back to the last close when no live quote is supplied.
  const lastClose = bars[bars.length - 1].c;
  const entry = input.quote && input.quote > 0 ? input.quote : lastClose;
  if (!(entry > 0)) return null;

  const closes = bars.map((b) => b.c);
  const atr14 = atr(bars, ATR_PERIOD);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  // Stop: the charter rule — tighter of a fixed band (8% swing / wider for mid)
  // and a 2×ATR level. `stopBandPct` undefined → resolveStopPrice's 8% default.
  const stopPrice = resolveStopPrice({
    entry,
    side: "long",
    atr: atr14,
    fixedPct: input.stopBandPct,
  });
  const riskPerShare = entry - stopPrice;
  if (!(riskPerShare > 0)) return null;

  // Target: prefer the prior high if it gives ≥ 2:1; else a 2R measured move.
  const priorHigh = Math.max(...bars.map((b) => b.h));
  const priorHighRR = (priorHigh - entry) / riskPerShare;
  const usePriorHigh = priorHigh > entry && priorHighRR >= MIN_REWARD_RISK;
  const takeProfit = usePriorHigh
    ? priorHigh
    : entry + MIN_REWARD_RISK * riskPerShare;
  const targetType: ManualProposalDraft["targetType"] = usePriorHigh
    ? "prior_high"
    : "measured_move";
  const rewardRisk = (takeProfit - entry) / riskPerShare;

  // Stop-first sizing, clamped by the per-position risk and size caps. Shared
  // with any sleeve on the risk-to-stop model via `sizeRiskToStop` (the math is
  // identical to the original inline formula).
  const riskPct = input.riskLimits?.perPositionRiskPct ?? DEFAULT_RISK_PCT;
  const sizePct = input.riskLimits?.perPositionSizePct ?? DEFAULT_SIZE_PCT;
  const allowFractional = input.allowFractional ?? true;
  const qty = sizeRiskToStop({
    equity,
    entry,
    riskPerShare,
    perPositionRiskPct: riskPct,
    perPositionSizePct: sizePct,
    allowFractional,
  });
  if (!(qty > 0)) return null;

  const relVol = computeRelativeVolume(bars.map((b) => b.v))?.ratio ?? null;

  const strategy: Strategy = input.strategy ?? "trend";
  const hasCatalyst =
    !!input.catalyst &&
    input.catalystType != null &&
    input.catalystType !== "none";
  const score =
    strategy === "value"
      ? scoreValueConviction({
          entry,
          sma200,
          high52w: priorHigh,
          rewardRisk,
          hasCatalyst,
          dividendFloor: input.dividendFloor ?? null,
          qualityDataKnown: input.qualityDataKnown ?? true,
        })
      : scoreConviction({
          entry,
          sma20,
          sma50,
          sma200,
          rewardRisk,
          relVol,
          hasCatalyst,
        });
  const tier = convictionTierFromScore(score);

  const sector = input.sector ?? null;
  const catalyst = input.catalyst ?? null;
  const catalystType = input.catalystType ?? null;

  const aboveFifty = sma50 != null && entry > sma50;
  const trendWord = aboveFifty
    ? sma200 != null && sma50 > sma200
      ? "above a rising 50- and 200-day"
      : "above its 50-day"
    : strategy === "value"
      ? "below its 50-day — a value / mean-reversion entry where counter-trend is expected"
      : "below its 50-day (counter-trend — caution)";
  const volWord =
    relVol == null
      ? "volume read unavailable"
      : relVol >= 1.3
        ? `above-average volume (${relVol.toFixed(2)}×)`
        : relVol <= 0.8
          ? `quiet volume (${relVol.toFixed(2)}×)`
          : `average volume (${relVol.toFixed(2)}×)`;
  // Catalyst wording reflects the THREE-state capture (catalyst-state-honesty M2):
  // a failed fetch reads "data unavailable — retry", never a flat "no catalyst".
  const catalystStateResolved = resolveCatalystState({
    catalyst,
    catalystState: input.catalystState,
  });
  const catalystWord = catalyst
    ? `Catalyst: ${catalyst}.`
    : catalystStateResolved === "unavailable"
      ? "Catalyst data unavailable — the news/research fetch failed (flagged for retry, NOT treated as catalyst-free)."
      : strategy === "value"
        ? "No catalyst or floor found (the value red-team flags this weak — 'cheap' alone is a value trap)."
        : "No catalyst found (trend-only — the red-team flags this weak).";

  const thesis =
    `${input.symbol} long at ${entry.toFixed(2)}: price ${trendWord}, ${volWord}. ` +
    `Stop ${stopPrice.toFixed(2)} (tighter of −8% / 2×ATR), target ${takeProfit.toFixed(2)} ` +
    `(${targetType.replace("_", " ")}, ${rewardRisk.toFixed(1)}:1 R:R). ${catalystWord}`;
  const reasoning =
    `Manual analyze-a-symbol request. Technicals: entry ${entry.toFixed(2)}, ` +
    `SMA20 ${fmt(sma20)}, SMA50 ${fmt(sma50)}, SMA200 ${fmt(sma200)}, ATR14 ${fmt(atr14)}. ` +
    `Sized stop-first: ${qty} sh ≈ ${(qty * entry).toFixed(0)} (${(
      (qty * riskPerShare) /
      equity *
      100
    ).toFixed(2)}% risk). Conviction ${score.toFixed(2)} (${tier}). ` +
    `Still subject to the risk rails + red-team.`;

  return {
    symbol: input.symbol,
    action: "buy",
    side: "long",
    strategy,
    qty,
    limitPrice: entry,
    stopPrice,
    takeProfit,
    targetType,
    sector,
    relativeVolume: relVol,
    catalyst,
    catalystType,
    convictionScore: round2(score),
    convictionTier: tier,
    riskPct: (qty * riskPerShare) / equity,
    confidence: round2(score),
    thesis,
    reasoning,
  };
}

/** Composite 0–1 conviction from the playbook signals. Weighted blend of trend,
 *  momentum, volume confirmation, reward/risk, and catalyst presence. */
function scoreConviction(s: {
  entry: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rewardRisk: number;
  relVol: number | null;
  hasCatalyst: boolean;
}): number {
  // Trend (0.35): clean uptrend (above rising 50/200) scores full.
  let trend: number;
  if (s.sma50 == null) trend = 0.5;
  else if (s.entry > s.sma50) {
    trend = s.sma200 == null ? 0.7 : s.sma50 > s.sma200 ? 1 : 0.6;
  } else trend = 0.2;

  // Momentum (0.2): above the 20-day.
  const momentum = s.sma20 == null ? 0.5 : s.entry > s.sma20 ? 1 : 0.3;

  // Volume (0.15): breakout-confirming vs quiet.
  const volume =
    s.relVol == null ? 0.5 : s.relVol >= 1.3 ? 1 : s.relVol >= 0.8 ? 0.6 : 0.4;

  // Reward/risk (0.2): 1:1 → 0, 2:1 → 0.5, ≥3:1 → 1.
  const rr = clamp01((s.rewardRisk - 1) / 2);

  // Catalyst (0.1).
  const catalyst = s.hasCatalyst ? 1 : 0.3;

  const score =
    0.35 * trend + 0.2 * momentum + 0.15 * volume + 0.2 * rr + 0.1 * catalyst;
  return clamp01(score);
}

/**
 * Composite 0–1 conviction under the **value / mean-reversion** lens (M1). The
 * key difference from the trend score: being **below** the long-term moving
 * average is the *discount* (the whole point), NOT a penalty. Weighted blend of
 * discount, reward/risk, and a real catalyst or floor — counter-trend is never a
 * strike. (Quality vs the value-trap is the value red-team's job, not a price
 * heuristic; this only ranks the queue.)
 */
function scoreValueConviction(s: {
  entry: number;
  sma200: number | null;
  high52w: number;
  rewardRisk: number;
  hasCatalyst: boolean;
  dividendFloor: { covered: boolean; atRisk: boolean } | null;
  qualityDataKnown: boolean;
}): number {
  // Discount (0.35): cheap relative to the long-term trend is the value zone.
  // Below the 200-day scores full; modestly above is neutral; well above is poor
  // value (it isn't a discount). Below-MA is rewarded, never punished.
  let discount: number;
  if (s.sma200 == null) discount = 0.6;
  else if (s.entry <= s.sma200) discount = 1;
  else if (s.entry <= s.sma200 * 1.05) discount = 0.6;
  else discount = 0.3;

  // Off-the-high (0.15): nearer a 52-week/multi-year low is a deeper discount.
  const drawdown = s.high52w > 0 ? (s.high52w - s.entry) / s.high52w : 0;
  const offHigh = clamp01(drawdown / 0.4); // ≥40% off the high → full

  // Reward/risk (0.25): 1:1 → 0, 2:1 → 0.5, ≥3:1 → 1.
  const rr = clamp01((s.rewardRisk - 1) / 2);

  // Catalyst or floor (0.1).
  const catalyst = s.hasCatalyst ? 1 : 0.3;

  // Dividend floor (0.15): a covered dividend is downside protection (lifts); an
  // uncovered / at-risk one is a value-trap weight (drags); unknown stays neutral.
  const dividend = s.dividendFloor
    ? s.dividendFloor.covered
      ? 1
      : s.dividendFloor.atRisk
        ? 0.1
        : 0.5
    : 0.5;

  const score =
    0.35 * discount + 0.15 * offHigh + 0.25 * rr + 0.1 * catalyst + 0.15 * dividend;

  // Unknown key quality data (cash-flow) is a PENALTY, not neutral
  // (conviction-honesty M1): drag the score AND cap it below "high" so a value
  // play whose cash flow we can't verify can never read high-conviction.
  if (!s.qualityDataKnown) {
    return clamp01(
      Math.min(score * CONVICTION_UNKNOWN_QUALITY_DRAG, CONVICTION_UNKNOWN_QUALITY_CAP),
    );
  }
  return clamp01(score);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const DEFAULT_CORE_REVIEW_TRIGGER = 0.25; // −25% drawdown flags a human review

export interface BuildCoreLongProposalInput {
  symbol: string;
  /** Daily OHLCV bars, oldest → newest. */
  bars: Ohlc[];
  /** Current quote — the entry anchor. Falls back to the last bar close. */
  quote?: number | null;
  /** Active book equity the position is sized against. */
  equity: number;
  /** Target portfolio weight for this core position, a fraction (0.4 === 40%).
   *  Human-specified; clamped to the sleeve's size cap. */
  targetWeightPct: number;
  /** The wide drawdown/review trigger that stands in for a stop, a fraction.
   *  Defaults to −25%. */
  reviewTriggerPct?: number;
  /** The sleeve's per-position size cap (core-long `perPositionSizePct`). */
  perPositionSizePct: number;
  sector?: string | null;
  /** Whether the business's quality (cash-flow) data is known — drags conviction
   *  when unknown. ETFs/funds pass `false` honestly (no single-name cash flow). */
  qualityDataKnown?: boolean;
  allowFractional?: boolean;
}

export interface CoreLongProposalDraft {
  symbol: string;
  action: "buy";
  side: "long";
  sleeve: "core-long";
  /** Back-compat display strategy; the sleeve drives the lens. */
  strategy: Strategy;
  qty: number;
  limitPrice: number;
  stopPrice: null;
  takeProfit: null;
  targetType: null;
  targetWeightPct: number;
  reviewTriggerPct: number;
  sector: string | null;
  relativeVolume: null;
  catalyst: null;
  catalystType: null;
  convictionScore: number;
  convictionTier: ConvictionTier;
  riskPct: number;
  confidence: number;
  thesis: string;
  reasoning: string;
}

/**
 * Build a **core-long** (long-term / core) proposal draft (core-long M3). Unlike
 * the swing builder, a core position is **sized to a target portfolio weight**
 * (`sizeByTargetWeight`), carries **no protective stop** and **no profit target**,
 * and is governed by a wide **drawdown/review trigger** instead. Conviction is a
 * modest, deterministic read: a core hold doesn't want a momentum setup, so the
 * score leans on quality being known and the entry not being wildly extended above
 * its long-term trend (a rough "not overpaying" proxy — the real valuation /
 * quality / cost prosecution is the core-long red-team's job).
 */
export function buildCoreLongProposalDraft(
  input: BuildCoreLongProposalInput,
): CoreLongProposalDraft | null {
  const { bars, equity } = input;
  if (bars.length < MIN_BARS || !(equity > 0)) return null;
  if (!(input.targetWeightPct > 0)) return null;

  const lastClose = bars[bars.length - 1].c;
  const entry = input.quote && input.quote > 0 ? input.quote : lastClose;
  if (!(entry > 0)) return null;

  const allowFractional = input.allowFractional ?? true;
  const qty = sizeByTargetWeight({
    equity,
    entry,
    targetWeightPct: input.targetWeightPct,
    perPositionSizePct: input.perPositionSizePct,
    allowFractional,
  });
  if (!(qty > 0)) return null;

  const sma200 = sma(
    bars.map((b) => b.c),
    200,
  );
  const qualityKnown = input.qualityDataKnown ?? false;
  // Modest deterministic conviction: base 0.5; +0.12 when quality is verified;
  // +0.12 when the entry isn't stretched far above its 200-day (a rough "not
  // overpaying" proxy). Never high on a stretched, quality-unknown name.
  let score = 0.5;
  if (qualityKnown) score += 0.12;
  const stretched = sma200 != null && entry > sma200 * 1.15;
  if (!stretched) score += 0.12;
  score = clamp01(score);
  const tier = convictionTierFromScore(score);

  const reviewTriggerPct = input.reviewTriggerPct ?? DEFAULT_CORE_REVIEW_TRIGGER;
  const weightPct = Math.min(input.targetWeightPct, input.perPositionSizePct);
  const sector = input.sector ?? null;
  const weightLabel = `${(weightPct * 100).toFixed(0)}%`;
  const trendNote =
    sma200 == null
      ? "long-term trend read unavailable"
      : entry > sma200
        ? stretched
          ? "trading well above its 200-day — confirm you are not overpaying"
          : "modestly above its 200-day"
        : "below its 200-day — a long-term value entry, counter-trend is normal here";

  const thesis = `Long-term core allocation in ${input.symbol} at a ${weightLabel} target weight${
    sector ? ` (${sector})` : ""
  } — ${trendNote}. Held to the allocation, reviewed on a −${(reviewTriggerPct * 100).toFixed(
    0,
  )}% drawdown rather than a stop.`;
  const reasoning = `Sized to a ${weightLabel} portfolio weight (no protective stop — a core buy-and-hold). Quality ${
    qualityKnown ? "verified" : "unverified (judged by the core-long red-team)"
  }. The core-long lens prosecutes overpaying vs long-term value, thesis drift, over-concentration, and (for a fund) cost.`;

  return {
    symbol: input.symbol,
    action: "buy",
    side: "long",
    sleeve: "core-long",
    // Back-compat display strategy; the sleeve is the real driver.
    strategy: "value",
    qty,
    limitPrice: round2(entry),
    stopPrice: null,
    takeProfit: null,
    targetType: null,
    targetWeightPct: weightPct,
    reviewTriggerPct,
    sector,
    relativeVolume: null,
    catalyst: null,
    catalystType: null,
    convictionScore: round2(score),
    convictionTier: tier,
    // No risk-to-stop on a core hold.
    riskPct: 0,
    confidence: round2(score),
    thesis,
    reasoning,
  };
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function fmt(n: number | null): string {
  return n == null ? "—" : n.toFixed(2);
}
