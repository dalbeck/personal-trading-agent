import type { TradeProposal } from "@/lib/types";
import { hasCashFlowData } from "@/lib/cash-flow";
import { hasDividendData } from "@/lib/dividend";

/**
 * Approval-proximity reading (approval-proximity-meter spec) — a derived,
 * transparent 0–100 gauge of "how close is the red-team to approval vs.
 * rejection," for an at-a-glance read on the proposal page sidebar.
 *
 * **Honesty constraint (non-negotiable).** The red-team verdict is a
 * **categorical** LLM judgment (`approve | concern | reject`), NOT a probability.
 * This meter is an *interpretive* reading — it is **anchored to the verdict band**
 * and only *modulated within* that band by the supporting signals, so it can
 * **never contradict the verdict**. It is read-only, feeds nothing downstream,
 * and changes no red-team / conviction / gate logic.
 *
 * Pure: proposal in, reading out — unit-tested across each band, the
 * modulations, and the data-completeness cap.
 */

export type ProximityVerdict = "approve" | "concern" | "reject";

export interface ProximityBand {
  key: ProximityVerdict;
  floor: number;
  ceil: number;
  /** Plain-English band label shown beside the number. */
  label: string;
}

/** Verdict → fixed 0–100 band. The number always agrees with the verdict. */
export const PROXIMITY_BANDS: Record<ProximityVerdict, ProximityBand> = {
  reject: { key: "reject", floor: 0, ceil: 33, label: "Far off — stay away" },
  concern: { key: "concern", floor: 34, ceil: 66, label: "Borderline — close call" },
  approve: { key: "approve", floor: 67, ceil: 100, label: "Clear — proceed" },
};

/* ----------------------- within-band modulation weights -------------------- *
 * All are fractions of the band height (0..1), applied to a midpoint start, so
 * the result can never leave the verdict band (it is clamped to [floor, ceil]). */

/** Start each band at its midpoint, then push from there. */
const NEUTRAL_T = 0.5;
/** Each net (supports − refutes) factor shifts this fraction of the band. */
const FACTOR_STEP = 0.12;
/** Max within-band shift from conviction at its extremes (0 or 1 vs 0.5). */
const CONVICTION_WEIGHT = 0.3;
/** When structured data is missing, the value is capped this many points below
 *  the band ceiling — you can't read "clear/high" on an incomplete file. */
export const CAP_BELOW_CEILING = 7;

export interface ProximityDriver {
  /** `up` = pushing toward approval (success), `down` = toward rejection. */
  direction: "up" | "down";
  /** e.g. "3 blocking factors", "conviction 64", "cash-flow data missing". */
  label: string;
}

export interface ApprovalProximity {
  /** `null` when the proposal carries no red-team verdict yet (unscored). */
  verdict: ProximityVerdict | null;
  /** 0–100 (unrounded — the component rounds for display); `null` when unscored. */
  value: number | null;
  band: ProximityBand | null;
  /** True when missing structured data caps the value below the band ceiling. */
  capped: boolean;
  /** 0–100 position of the faint cap marker when capped; `null` otherwise. */
  capValue: number | null;
  /** Short reason naming the missing data when capped (e.g. "cash-flow data missing"). */
  capReason: string | null;
  /** Top contributing signals (≤ 3) for the "what's moving it" row. */
  drivers: ProximityDriver[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const UNSCORED: ApprovalProximity = {
  verdict: null,
  value: null,
  band: null,
  capped: false,
  capValue: null,
  capReason: null,
  drivers: [],
};

export function deriveApprovalProximity(p: TradeProposal): ApprovalProximity {
  const verdict = p.redTeam?.verdict ?? null;
  if (!verdict) return UNSCORED;

  const band = PROXIMITY_BANDS[verdict];
  const factors = p.redTeam?.factors ?? [];
  const refutes = factors.filter((f) => f.stance === "refutes").length;
  const supports = factors.filter((f) => f.stance === "supports").length;
  const conviction = p.convictionScore; // 0..1 | null

  // Within-band position t ∈ [0,1]: midpoint, then factor + conviction pressure.
  let t = NEUTRAL_T;
  t += FACTOR_STEP * (supports - refutes);
  if (conviction !== null) t += CONVICTION_WEIGHT * (conviction - 0.5) * 2;
  t = clamp(t, 0, 1);

  let value = band.floor + t * (band.ceil - band.floor);

  // Data completeness — scoped to the VALUE lens, where cash-flow / dividend ARE
  // the thesis (the conviction-honesty principle is value-specific). A trend
  // proposal isn't "incomplete" for lacking cash-flow — that isn't part of its
  // file — so it is never capped on that basis.
  const expectsQualityData = p.strategy === "value";
  const cashMissing = expectsQualityData && !hasCashFlowData(p.cashFlow);
  const divMissing = expectsQualityData && !hasDividendData(p.dividend);
  const incomplete = cashMissing || divMissing;

  let capped = false;
  let capValue: number | null = null;
  let capReason: string | null = null;
  if (incomplete) {
    capValue = Math.max(band.floor, band.ceil - CAP_BELOW_CEILING);
    if (value > capValue) value = capValue;
    capped = true;
    const missing = [
      cashMissing ? "cash-flow" : null,
      divMissing ? "dividend" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    capReason = `${missing} data missing`;
  }

  // "What's moving it" — top signals, in order: factors, conviction, data.
  const drivers: ProximityDriver[] = [];
  if (refutes > 0) {
    drivers.push({
      direction: "down",
      label: `${refutes} blocking factor${refutes === 1 ? "" : "s"}`,
    });
  } else if (supports > 0) {
    drivers.push({
      direction: "up",
      label: `${supports} supporting factor${supports === 1 ? "" : "s"}`,
    });
  }
  if (conviction !== null) {
    drivers.push({
      direction: conviction >= 0.5 ? "up" : "down",
      label: `conviction ${Math.round(conviction * 100)}`,
    });
  }
  if (expectsQualityData) {
    drivers.push(
      incomplete
        ? { direction: "down", label: capReason! }
        : { direction: "up", label: "full data coverage" },
    );
  }

  return {
    verdict,
    value,
    band,
    capped,
    capValue,
    capReason,
    drivers: drivers.slice(0, 3),
  };
}
