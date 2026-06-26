/**
 * How fresh a persisted snapshot is, relative to "now". Pure + client-safe (no
 * server imports) so the LIVE panel can show a **stale** badge when a scheduled
 * read-only refresh hasn't landed recently — the visible half of "surface
 * snapshot freshness; alert if a refresh is stale/failed".
 *
 * The default threshold (6h) is wider than the largest gap between scheduled
 * live refreshes, so a snapshot only reads as **stale** when a refresh was
 * actually missed (e.g. a failed run), not merely between cadences.
 */

export const SNAPSHOT_STALE_AFTER_MINUTES = 360;

export interface SnapshotFreshness {
  /** Age in whole minutes, or `null` when there is no usable timestamp. */
  ageMinutes: number | null;
  /** True when the snapshot is older than the stale threshold. */
  stale: boolean;
}

export function snapshotFreshness(
  asOf: string | null | undefined,
  now: Date,
  staleAfterMinutes: number = SNAPSHOT_STALE_AFTER_MINUTES,
): SnapshotFreshness {
  if (!asOf) return { ageMinutes: null, stale: false };
  const then = new Date(asOf).getTime();
  if (Number.isNaN(then)) return { ageMinutes: null, stale: false };
  // Clamp clock skew (a future timestamp) to zero rather than a negative age.
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  return { ageMinutes, stale: ageMinutes >= staleAfterMinutes };
}
