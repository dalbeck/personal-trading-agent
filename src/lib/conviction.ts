import type { TradeProposal } from "@/lib/types";

/**
 * Conviction tiers for the diversified-discovery funnel (M1). A discovery run
 * now surfaces a *larger* candidate set than the daily order cap, so the queue
 * is **ranked + tiered** and the strongest setups sort first. The tier is a
 * **review-funnel preference**, never a safety rail — every tier is shown by
 * default (the human filters only if overloaded), and every candidate, whatever
 * its tier, still clears the hard risk rails and the red-team prosecutor.
 *
 * `high` → moderate → `watch`, strongest first.
 */
export type ConvictionTier = "high" | "moderate" | "watch";

/** The tiers in strongest-first order — the canonical sort/rank order. */
export const CONVICTION_TIERS: readonly ConvictionTier[] = [
  "high",
  "moderate",
  "watch",
] as const;

/**
 * Bucket a composite conviction score (0–1) into a tier. Thresholds mirror the
 * confidence buckets so the two read consistently: **high ≥ 0.7 · moderate ≥
 * 0.4 · watch < 0.4**. Out-of-range / non-finite scores clamp into [0, 1].
 *
 * The score is a blend of the playbook's signals (trend, momentum, relative
 * strength, volume, R:R, catalyst) the discovery analyst assigns; the tier is
 * just its labelled bucket, used to sort the queue and drive an optional filter.
 */
export function convictionTierFromScore(score: number): ConvictionTier {
  const s = clamp01(score);
  if (s >= 0.7) return "high";
  if (s >= 0.4) return "moderate";
  return "watch";
}

/** Lower rank = stronger conviction = sorts first. A missing tier ranks last
 *  (weakest) but is **never hidden** — the funnel shows everything by default. */
function tierRank(tier: ConvictionTier | null): number {
  if (tier === null) return CONVICTION_TIERS.length;
  return CONVICTION_TIERS.indexOf(tier);
}

/**
 * Comparator that sorts proposals **high-conviction first**: by tier, then by
 * `convictionScore` (higher first), then newest-first as a stable fallback. Used
 * to rank the proposal queue so the best setups surface at the top — sorting,
 * not filtering: every tier still renders.
 */
export function compareByConviction(a: TradeProposal, b: TradeProposal): number {
  const byTier = tierRank(a.convictionTier) - tierRank(b.convictionTier);
  if (byTier !== 0) return byTier;
  const byScore = (b.convictionScore ?? 0) - (a.convictionScore ?? 0);
  if (byScore !== 0) return byScore;
  // Newest first.
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
