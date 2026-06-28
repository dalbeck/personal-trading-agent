import type {
  CashFlowQuality,
  RedTeamVerdict,
  ResearchStatus,
} from "@/lib/types";
import type { Strategy } from "@/lib/strategy";
import { hasCashFlowData } from "@/lib/cash-flow";
import {
  isResearchUnavailable,
  researchUnavailableLabel,
} from "@/lib/research-availability";

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
 * **Lens-aware (proximity-meter-lens-aware M0).** The input is the
 * **currently-toggled lens**, not the proposal — so a dual-lens analysis updates
 * the reading when the Trend/Value toggle flips (each lens carries its own
 * verdict, conviction, and quality data). A `TradeProposal` (its top-level fields
 * mirror the active lens) and a `ProposalLensBreakdown` both satisfy
 * {@link ProximityInput}, so single-lens proposals read identically.
 *
 * Pure: a lens in, a reading out — unit-tested across each band, the
 * modulations, the lens switch, and the applicable-vs-unavailable data cap.
 */

export type ProximityVerdict = "approve" | "concern" | "reject";

/**
 * The minimal lens fields the proximity reading needs. Both a `TradeProposal`
 * (top-level = the active lens) and a `ProposalLensBreakdown` (one toggled lens)
 * are structurally assignable, which is what makes the meter lens-aware.
 */
export interface ProximityInput {
  strategy: Strategy;
  redTeam: RedTeamVerdict | null;
  convictionScore: number | null;
  /** The value lens's cash-flow block — null when absent / not a value lens. */
  cashFlow: CashFlowQuality | null;
  /** Whether the value-quality research was obtained (`ok`) or off/capped/failed. */
  researchStatus: ResearchStatus | null;
}

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

export function deriveApprovalProximity(p: ProximityInput): ApprovalProximity {
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

  // Data completeness — scoped to the VALUE lens, where cash-flow IS the thesis
  // (the conviction-honesty principle is value-specific). A trend proposal isn't
  // "incomplete" for lacking cash-flow — that isn't part of its file — so it is
  // never capped on that basis.
  //
  // **Applicable-vs-unavailable (proximity-meter-lens-aware M0).** Only cap when
  // the quality data was EXPECTED BUT UNAVAILABLE, not when it's legitimately
  // absent:
  //   • cash-flow is expected for *every* value play. It caps only when it is
  //     missing AND the value research did not come back `ok` (off / capped /
  //     failed, per `researchStatus`) — i.e. we tried and couldn't get it.
  //   • a missing DIVIDEND is "absent by nature": a value play needn't pay one
  //     (e.g. NOW pays none). It NEVER caps on its own — the dividend floor is a
  //     bonus signal, not a completeness requirement.
  // So a non-payer with cash-flow present and research `ok` reads COMPLETE — no
  // cap — even though its dividend block is null.
  const expectsQualityData = p.strategy === "value";
  const cashFlowPresent = hasCashFlowData(p.cashFlow);
  const cashFlowUnavailable =
    expectsQualityData && !cashFlowPresent && p.researchStatus !== "ok";

  let capped = false;
  let capValue: number | null = null;
  let capReason: string | null = null;
  if (cashFlowUnavailable) {
    capValue = Math.max(band.floor, band.ceil - CAP_BELOW_CEILING);
    if (value > capValue) value = capValue;
    capped = true;
    // Name the failure reason when we have one (off / capped / fetch failed);
    // otherwise (legacy null status) stay generic.
    const reason = isResearchUnavailable(p.researchStatus)
      ? researchUnavailableLabel(p.researchStatus)
      : null;
    capReason = reason
      ? `cash-flow data unavailable — ${reason}`
      : "cash-flow data unavailable";
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
      cashFlowUnavailable
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
