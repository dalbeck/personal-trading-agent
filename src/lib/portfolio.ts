/**
 * Portfolio-allocation math (portfolio M5) — pure, client-safe so the Portfolio
 * view and the server both compute drift the same way. A holding carries no sleeve
 * on the broker snapshot, so its sleeve is **attributed** from the trade journal:
 * the most recent buy for that symbol that was tagged `sleeve:<id>` on approval
 * (falling back to the older `lens:<strategy>` tag → its swing sleeve, else
 * "unattributed"). From those attributions we roll holdings up to per-sleeve
 * weights and compare them to the human's target allocation.
 */
import { SLEEVE_CONFIGS } from "@strategy/sleeves.config";
import { strategyToSleeve, type Sleeve } from "@/lib/sleeves";
import type { AllocationTarget } from "@/lib/types";

/** A holding's sleeve, or "unattributed" when no opening trade is tagged. */
export type AttributedSleeve = Sleeve | "unattributed";

/** The minimal journal shape attribution needs (a tagged buy with a timestamp). */
export interface AttributionEntry {
  symbol: string;
  timestamp: string;
  action: "buy" | "sell";
  tags?: string[];
}

/** The minimal position shape the weight roll-up needs. */
export interface WeightedPosition {
  symbol: string;
  marketValue: number;
}

const SLEEVES = new Set<Sleeve>([
  "swing-trend",
  "swing-value",
  "position-mid",
  "core-long",
]);

/** Parse a sleeve from a trade entry's tags: a `sleeve:<id>` tag wins; else a
 *  legacy `lens:<strategy>` tag maps to its swing sleeve. Null when neither. */
function sleeveFromTags(tags: string[] | undefined): Sleeve | null {
  if (!tags) return null;
  for (const tag of tags) {
    if (tag.startsWith("sleeve:")) {
      const s = tag.slice("sleeve:".length);
      if (SLEEVES.has(s as Sleeve)) return s as Sleeve;
    }
  }
  for (const tag of tags) {
    if (tag.startsWith("lens:")) {
      const strat = tag.slice("lens:".length);
      if (strat === "trend" || strat === "value") return strategyToSleeve(strat);
    }
  }
  return null;
}

/**
 * Attribute a held symbol to a sleeve from the journal — the **most recent buy**
 * for that symbol that carries a sleeve/lens tag. Returns "unattributed" when no
 * tagged opening trade is found (older holdings, or trades from before tagging).
 */
export function attributeSleeve(
  symbol: string,
  journal: readonly AttributionEntry[],
): AttributedSleeve {
  const buys = journal
    .filter((e) => e.action === "buy" && e.symbol === symbol)
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)); // newest first
  for (const buy of buys) {
    const sleeve = sleeveFromTags(buy.tags);
    if (sleeve) return sleeve;
  }
  return "unattributed";
}

export interface SleeveWeight {
  sleeve: AttributedSleeve;
  marketValueUsd: number;
  /** Fraction of total equity. */
  weightPct: number;
}

/**
 * Roll current holdings up to per-sleeve weights (vs total equity). Unattributed
 * holdings are bucketed under "unattributed" so the view is honest about what it
 * couldn't place. Cash is `equity − Σ marketValue` and is reported separately by
 * the caller (it is not a sleeve).
 */
export function computeSleeveWeights(
  positions: readonly WeightedPosition[],
  journal: readonly AttributionEntry[],
  equity: number,
): SleeveWeight[] {
  const bySleeve = new Map<AttributedSleeve, number>();
  for (const p of positions) {
    const sleeve = attributeSleeve(p.symbol, journal);
    bySleeve.set(sleeve, (bySleeve.get(sleeve) ?? 0) + p.marketValue);
  }
  const order: AttributedSleeve[] = [
    "swing-trend",
    "swing-value",
    "position-mid",
    "core-long",
    "unattributed",
  ];
  return order
    .filter((s) => bySleeve.has(s))
    .map((sleeve) => {
      const marketValueUsd = bySleeve.get(sleeve) ?? 0;
      return {
        sleeve,
        marketValueUsd,
        weightPct: equity > 0 ? marketValueUsd / equity : 0,
      };
    });
}

export type DriftStatus = "over" | "under" | "on-target";

export interface SleeveDrift {
  sleeve: Sleeve;
  targetPct: number;
  currentPct: number;
  /** Signed: current − target (positive = overweight). */
  driftPct: number;
  status: DriftStatus;
  /** True when |drift| exceeds the band → a rebalance is suggested. */
  pastBand: boolean;
}

/**
 * Per-sleeve drift vs the human's target allocation. A sleeve more than
 * `driftBandPct` above its target is `over` (trim), more than the band below is
 * `under` (add); within the band is `on-target`. A targeted sleeve with no current
 * holding reads 0% current (fully under).
 */
export function computeDrift(
  current: readonly SleeveWeight[],
  targets: readonly AllocationTarget[],
  driftBandPct: number,
): SleeveDrift[] {
  const currentBySleeve = new Map<AttributedSleeve, number>(
    current.map((c) => [c.sleeve, c.weightPct]),
  );
  return targets.map((t) => {
    const currentPct = currentBySleeve.get(t.sleeve) ?? 0;
    const driftPct = currentPct - t.targetWeightPct;
    const pastBand = Math.abs(driftPct) > driftBandPct;
    const status: DriftStatus = !pastBand
      ? "on-target"
      : driftPct > 0
        ? "over"
        : "under";
    return {
      sleeve: t.sleeve,
      targetPct: t.targetWeightPct,
      currentPct,
      driftPct,
      status,
      pastBand,
    };
  });
}

/** A position with the cost-basis fields the performance roll-up needs. */
export interface PerfPosition extends WeightedPosition {
  costBasis: number;
  unrealizedPl: number;
}

export interface SleevePerformance {
  sleeve: AttributedSleeve;
  positions: number;
  costBasisUsd: number;
  marketValueUsd: number;
  unrealizedPlUsd: number;
  /** Unrealized P&L as a fraction of cost basis; null when no cost basis. */
  unrealizedPlPct: number | null;
  /** The sleeve's benchmark label (from the registry); null for unattributed. */
  benchmark: string | null;
}

/**
 * Per-sleeve performance, sleeve-scoped with **no cross-sleeve bleed** (each
 * holding counts only toward its attributed sleeve — the same isolation that keeps
 * paper/live stats separate). Returns one row per sleeve that holds something, in
 * registry order, plus an "unattributed" row when present. A per-sleeve
 * benchmark *return* needs a per-sleeve equity curve we don't keep, so the row
 * carries the benchmark **label** + the sleeve's own unrealized return; the
 * blended whole-book benchmark return lives on the snapshot.
 */
export function buildSleevePerformance(
  positions: readonly PerfPosition[],
  journal: readonly AttributionEntry[],
): SleevePerformance[] {
  const bySleeve = new Map<AttributedSleeve, PerfPosition[]>();
  for (const p of positions) {
    const sleeve = attributeSleeve(p.symbol, journal);
    const list = bySleeve.get(sleeve) ?? [];
    list.push(p);
    bySleeve.set(sleeve, list);
  }
  const order: AttributedSleeve[] = [
    "swing-trend",
    "swing-value",
    "position-mid",
    "core-long",
    "unattributed",
  ];
  return order
    .filter((s) => bySleeve.has(s))
    .map((sleeve) => {
      const list = bySleeve.get(sleeve)!;
      const costBasisUsd = list.reduce((s, p) => s + p.costBasis, 0);
      const marketValueUsd = list.reduce((s, p) => s + p.marketValue, 0);
      const unrealizedPlUsd = list.reduce((s, p) => s + p.unrealizedPl, 0);
      return {
        sleeve,
        positions: list.length,
        costBasisUsd,
        marketValueUsd,
        unrealizedPlUsd,
        unrealizedPlPct: costBasisUsd === 0 ? null : unrealizedPlUsd / costBasisUsd,
        benchmark:
          sleeve === "unattributed" ? null : SLEEVE_CONFIGS[sleeve].benchmark,
      };
    });
}
