/**
 * Entry-level freshness (fresh-entry-levels M1). A proposal's entry/stop/target/
 * sizing are anchored to the Alpaca quote **at analysis time**. If the price then
 * drifts, the stop, reward/risk, and sizing computed off the stale entry are all
 * wrong — the JKHY case (entry $135 vs ~$128 trading) is exactly this. These pure
 * helpers measure that drift so the UI can flag it and the approval guard can
 * require a re-anchor before placing an order.
 *
 * Plain module (no `server-only`) so the client freshness indicator and the
 * server approval guard share one definition of "stale". Pure + unit-tested.
 */

/** Drift beyond this fraction (1.5%, mid of the 1–2% band) marks levels stale. */
export const STALE_DRIFT_THRESHOLD = 0.015;

/**
 * The signed fraction the current quote has moved from the anchored entry:
 * `(quote − entry) / entry` (0.05 === the quote is 5% above the entry). Returns
 * null when the entry is unusable or either input is non-finite — callers then
 * treat staleness as unknown (never block on it).
 */
export function computePriceDrift(
  entry: number,
  quote: number,
): number | null {
  if (!Number.isFinite(entry) || !Number.isFinite(quote) || entry <= 0) {
    return null;
  }
  return (quote - entry) / entry;
}

/**
 * True when the entry has drifted from the current quote beyond `threshold`.
 * **Fail-soft:** an uncomputable drift (no/invalid quote) is never stale, so a
 * transient quote-read failure can't block every order on staleness alone.
 */
export function isStaleEntry(
  entry: number,
  quote: number,
  threshold = STALE_DRIFT_THRESHOLD,
): boolean {
  const drift = computePriceDrift(entry, quote);
  return drift !== null && Math.abs(drift) > threshold;
}

const MINUS = "−"; // U+2212, matches the shared formatters' true minus

/** A signed-percent drift label (e.g. "+5.00%" / "−5.00%"), or "—" when it
 *  can't be computed. */
export function driftLabel(entry: number, quote: number): string {
  const drift = computePriceDrift(entry, quote);
  if (drift === null) return "—";
  const pct = Math.abs(drift * 100).toFixed(2);
  const sign = drift < 0 ? MINUS : "+";
  return `${sign}${pct}%`;
}
