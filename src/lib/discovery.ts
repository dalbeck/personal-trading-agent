/**
 * Pure bounds for the autonomous-discovery routine (M3). The discovery run is
 * LLM-driven (a `claude -p` routine), but the caps it must respect live in code
 * (`DISCOVERY_LIMITS` in the charter) and are computed here so they are
 * unit-tested and unambiguous.
 *
 * Discovery output is always review-only — auto-generated proposals are
 * candidates for human review, never auto-acted — and watchlist auto-adds are
 * tracking-only (no order, no execution path).
 */

/** How many NEW proposals a discovery run may still emit for an account: the
 *  per-run cap (the generous `DISCOVERY_LIMITS.ideaCap`, a review-funnel
 *  preference) minus what's already pending. Never negative. This caps the
 *  size of the *review queue*, not the daily ORDER cap (6, a hard rail) — the
 *  two are decoupled (M1): a larger funnel of candidates, still only ≤6 orders
 *  a day can ever act on. */
export function discoveryProposalBudget(
  pending: number,
  ideaCap: number,
): number {
  return Math.max(0, ideaCap - Math.max(0, pending));
}

/** A scored discovery candidate, before it becomes a proposal. `score` is the
 *  0–1 composite of the playbook signals; `sector` is its GICS sector (null when
 *  unknown — an unknown sector can't be concentration-capped). */
export interface DiscoveryCandidate {
  symbol: string;
  sector: string | null;
  score: number;
}

/**
 * Pick a **sector-diversified, best-in-sector** candidate set from a broad,
 * multi-sector universe (M1). A trend / relative-strength desk concentrates in
 * the leading sector by design, so diversification here means **the strongest
 * setup *within* each sector**, not buying laggards.
 *
 * The selection:
 * - ranks each sector's names by score (best-in-sector first),
 * - **spreads across sectors first** — it takes the top name of every sector
 *   before any sector's second name, so the queue is provably a mix and a
 *   single hot sector can't crowd everything out,
 * - caps each sector at `maxPerSector`, and
 * - stops at `ideaCap` total.
 *
 * Unknown-sector (`null`) names are treated **individually** — each is its own
 * bucket, so the per-sector cap can never falsely drop an uncategorised name
 * (fails open, mirroring the charter's concentration rail). Pure + deterministic
 * so it is unit-tested on a synthetic universe; the chosen set still clears the
 * hard risk rails + red-team downstream.
 */
export function selectDiscoveryCandidates(
  candidates: DiscoveryCandidate[],
  opts: { ideaCap: number; maxPerSector: number },
): DiscoveryCandidate[] {
  const ideaCap = Math.max(0, Math.floor(opts.ideaCap));
  const maxPerSector = Math.max(1, Math.floor(opts.maxPerSector));
  if (ideaCap === 0 || candidates.length === 0) return [];

  // Bucket by sector; each unknown-sector name gets a unique bucket key so it is
  // never grouped (and so never falsely per-sector capped).
  const buckets = new Map<string, DiscoveryCandidate[]>();
  let unknownSeq = 0;
  for (const c of candidates) {
    const key = c.sector ?? ` unknown-${unknownSeq++}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  // Rank within each bucket (best-in-sector), then order the buckets by their
  // strongest candidate so stronger sectors are served first in the round-robin.
  const ranked = [...buckets.values()].map((bucket) =>
    [...bucket].sort((a, b) => b.score - a.score),
  );
  ranked.sort((a, b) => b[0].score - a[0].score);

  // Round-robin across sectors: take the Nth-best of each sector in turn, so
  // every sector is represented before any sector goes deeper (spread first).
  const selected: DiscoveryCandidate[] = [];
  for (let depth = 0; depth < maxPerSector; depth++) {
    for (const bucket of ranked) {
      if (selected.length >= ideaCap) return selected;
      const pick = bucket[depth];
      if (pick) selected.push(pick);
    }
  }
  return selected;
}
