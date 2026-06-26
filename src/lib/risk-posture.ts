import { RISK_LIMITS } from "@strategy/charter.config";
import type { PortfolioSnapshot } from "@/lib/types";

/**
 * Risk-posture snapshot (M6) — a Conservative ↔ Aggressive reading computed
 * from REAL portfolio signals, never a vibe. This is a pure, side-effect-free
 * module so the score is unit-tested; the server only maps a snapshot into the
 * inputs. It is a **snapshot of current posture, not a prediction or a safety
 * rating** — high "Aggressive" is not "bad", just more exposed.
 */

export type PostureLevel = "Conservative" | "Moderate" | "Aggressive";

export interface PostureFactor {
  key:
    | "deployment"
    | "concentration"
    | "positions"
    | "riskPerTrade"
    | "drawdown"
    | "rails";
  label: string;
  /** Contribution sub-score, 0–100 (how aggressive this signal reads). */
  value: number;
  /** Relative weight in the blended score (for the breakdown bars). */
  weight: number;
  /** Plain-language measured value, e.g. "62% deployed". */
  detail: string;
}

export interface RiskPosture {
  /** Blended posture score, 0 (fully conservative) – 100 (fully aggressive). */
  score: number;
  level: PostureLevel;
  factors: PostureFactor[];
  /** One-line plain-language reading of what the posture means. */
  summary: string;
}

export interface PostureLimits {
  maxConcurrentPositions: number;
  perPositionRiskPct: number;
  perPositionSizePct: number;
  drawdownHaltPct: number;
}

export interface PostureInputPosition {
  symbol: string;
  marketValue: number;
  /** Risk to the protective stop in account currency, or null when no stop. */
  riskToStop: number | null;
}

export interface RiskPostureInputs {
  equity: number;
  cash: number;
  positions: PostureInputPosition[];
  limits: PostureLimits;
  /** Current drawdown from the high-water mark (fraction ≥ 0), or null. */
  drawdownPct: number | null;
  /** Whether the human has loosened/disabled any risk rail (optional signal). */
  railsLoosened?: boolean;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const pctText = (frac: number): string => `${Math.round(frac * 100)}%`;

/** Raw weights; the blend renormalizes over the factors actually present. */
const WEIGHTS = {
  deployment: 0.28,
  concentration: 0.24,
  positions: 0.16,
  riskPerTrade: 0.2,
  drawdown: 0.12,
  rails: 0.08,
} as const;

export function levelForScore(score: number): PostureLevel {
  if (score < 33) return "Conservative";
  if (score <= 66) return "Moderate";
  return "Aggressive";
}

/**
 * Blend the real signals into a 0–100 posture score + the contributing factors
 * + a one-line summary. Each factor normalizes a measurement against its rail
 * (deployment vs equity, concentration vs the per-name size cap, positions vs
 * the 5-cap, risk-per-trade vs the 2% rail, drawdown vs the −10% halt) into a
 * 0–100 sub-score, then the present factors are weight-averaged.
 */
export function computeRiskPosture(inputs: RiskPostureInputs): RiskPosture {
  const { equity, cash, positions, limits, drawdownPct, railsLoosened } =
    inputs;
  const factors: PostureFactor[] = [];

  const safeEquity = equity > 0 ? equity : 0;

  // 1 — Capital deployed (vs cash). More deployed → more aggressive.
  const deployedFrac =
    safeEquity > 0 ? clamp01((equity - cash) / equity) : 0;
  factors.push({
    key: "deployment",
    label: "Capital deployed",
    value: deployedFrac * 100,
    weight: WEIGHTS.deployment,
    detail: `${pctText(deployedFrac)} deployed`,
  });

  // 2 — Top-name concentration (vs the per-position size cap).
  const topValue = positions.reduce(
    (m, p) => Math.max(m, p.marketValue),
    0,
  );
  const topFrac = safeEquity > 0 ? topValue / equity : 0;
  const concentrationSub =
    limits.perPositionSizePct > 0
      ? clamp01(topFrac / limits.perPositionSizePct) * 100
      : 0;
  factors.push({
    key: "concentration",
    label: "Top-name concentration",
    value: concentrationSub,
    weight: WEIGHTS.concentration,
    detail:
      positions.length === 0 ? "no positions" : `${pctText(topFrac)} top name`,
  });

  // 3 — Open positions vs the concurrent-position cap.
  const posSub =
    limits.maxConcurrentPositions > 0
      ? clamp01(positions.length / limits.maxConcurrentPositions) * 100
      : 0;
  factors.push({
    key: "positions",
    label: "Open positions vs cap",
    value: posSub,
    weight: WEIGHTS.positions,
    detail: `${positions.length} / ${limits.maxConcurrentPositions}`,
  });

  // 4 — Average risk-per-trade vs the 2% rail (only positions with a stop).
  const withStops = positions.filter((p) => p.riskToStop !== null);
  if (withStops.length > 0 && safeEquity > 0) {
    const avgRiskFrac =
      withStops.reduce((s, p) => s + (p.riskToStop as number) / equity, 0) /
      withStops.length;
    const riskSub =
      limits.perPositionRiskPct > 0
        ? clamp01(avgRiskFrac / limits.perPositionRiskPct) * 100
        : 0;
    factors.push({
      key: "riskPerTrade",
      label: "Avg risk per trade vs 2% rail",
      value: riskSub,
      weight: WEIGHTS.riskPerTrade,
      detail: `${(avgRiskFrac * 100).toFixed(1)}% avg`,
    });
  }

  // 5 — Drawdown proximity to the halt. Closer to the halt → more realized risk.
  if (drawdownPct !== null) {
    const ddSub =
      limits.drawdownHaltPct > 0
        ? clamp01(drawdownPct / limits.drawdownHaltPct) * 100
        : 0;
    factors.push({
      key: "drawdown",
      label: "Drawdown vs halt",
      value: ddSub,
      weight: WEIGHTS.drawdown,
      detail: `−${(drawdownPct * 100).toFixed(1)}%`,
    });
  }

  // 6 — Whether the human has loosened/disabled a rail (optional).
  if (railsLoosened !== undefined) {
    factors.push({
      key: "rails",
      label: "Risk rails",
      value: railsLoosened ? 100 : 0,
      weight: WEIGHTS.rails,
      detail: railsLoosened ? "loosened" : "all on",
    });
  }

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round(
          factors.reduce((s, f) => s + f.value * f.weight, 0) / totalWeight,
        )
      : 0;
  const level = levelForScore(score);

  return { score, level, factors, summary: summarize(level, factors) };
}

/** Deterministic one-line reading from the level + the dominant factors. */
function summarize(level: PostureLevel, factors: PostureFactor[]): string {
  const by = (key: PostureFactor["key"]): number =>
    factors.find((f) => f.key === key)?.value ?? 0;

  const posture =
    level === "Conservative"
      ? "Conservative posture"
      : level === "Moderate"
        ? "Balanced posture"
        : "Aggressive posture";

  const deployment = by("deployment");
  const exposure =
    deployment < 25
      ? "mostly in cash"
      : deployment < 60
        ? "moderate exposure"
        : "heavily deployed";

  const clauses: string[] = [];
  if (by("concentration") >= 60) clauses.push("one concentrated name");
  if (by("positions") >= 100) clauses.push("at the position cap");
  if (by("riskPerTrade") >= 80) clauses.push("wide per-trade risk");
  if (by("drawdown") >= 60) clauses.push("drawing down toward the halt");
  if (by("rails") >= 100) clauses.push("a loosened rail");

  const tail = clauses.length ? ` with ${joinClauses(clauses)}` : "";
  return `${posture} — ${exposure}${tail}.`;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}

/**
 * Map a portfolio snapshot into posture inputs and compute the reading. Pure
 * (no I/O): the server reads the snapshot + settings and calls this. Normalizes
 * against the charter rails (`RISK_LIMITS`); `railsLoosened` is the separate
 * human-override signal. Drawdown comes from the snapshot's equity curve.
 */
export function riskPostureFromSnapshot(
  snapshot: PortfolioSnapshot,
  opts?: { railsLoosened?: boolean },
): RiskPosture {
  const curve = snapshot.equityCurve ?? [];
  let drawdownPct: number | null = null;
  if (curve.length >= 2) {
    const peak = curve.reduce((m, p) => Math.max(m, p.equity), 0);
    drawdownPct =
      peak > 0 ? Math.max(0, (peak - snapshot.equity) / peak) : 0;
  }

  const positions: PostureInputPosition[] = snapshot.positions.map((p) => {
    const riskToStop =
      p.stopPrice === null
        ? null
        : Math.max(
            0,
            p.side === "short"
              ? (p.stopPrice - p.lastPrice) * p.qty
              : (p.lastPrice - p.stopPrice) * p.qty,
          );
    return { symbol: p.symbol, marketValue: p.marketValue, riskToStop };
  });

  return computeRiskPosture({
    equity: snapshot.equity,
    cash: snapshot.cash,
    positions,
    limits: {
      maxConcurrentPositions: RISK_LIMITS.maxConcurrentPositions,
      perPositionRiskPct: RISK_LIMITS.perPositionRiskPct,
      perPositionSizePct: RISK_LIMITS.perPositionSizePct,
      drawdownHaltPct: RISK_LIMITS.drawdownHaltPct,
    },
    drawdownPct,
    railsLoosened: opts?.railsLoosened,
  });
}
