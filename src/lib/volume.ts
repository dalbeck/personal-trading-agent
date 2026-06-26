/**
 * Relative-volume helper (M2). Relative volume = the current (entry-day) volume
 * ÷ the trailing average daily volume — the volume confirmation the playbook
 * checklist asks for. A breakout/momentum entry wants **above-average** volume
 * (≈ 1.3× or more); a pullback/reset entry should come on **declining /
 * below-average** volume. It is a **soft signal** weighed by the checklist +
 * red-team, never a hard rail. Plain module (no `server-only`) so client cards
 * and the server resolver share the same math + display rules.
 */

/** Trailing window for the baseline average (charter/spec: 20–50 days). */
export const REL_VOLUME_LOOKBACK = 50;
/** Minimum baseline samples before a ratio is meaningful. */
export const REL_VOLUME_MIN_SAMPLES = 20;
/** A breakout needs at least this multiple of average volume to confirm. */
export const REL_VOLUME_BREAKOUT_MIN = 1.3;
/** Below this multiple the day is quiet/declining (constructive for a pullback). */
export const REL_VOLUME_QUIET_MAX = 0.8;

export interface RelativeVolume {
  /** current ÷ trailing-average (e.g. 1.42 = 142% of the average day). */
  ratio: number;
  /** The current (most-recent) day's volume. */
  current: number;
  /** Trailing average daily volume over the baseline window. */
  average: number;
  /** How many days the baseline averaged. */
  samples: number;
}

/**
 * Compute relative volume from a daily-volume series (oldest → newest). The last
 * element is the current day; the baseline is the average of up to `lookback`
 * **prior** days (the current day is excluded so a spike can't dilute its own
 * baseline). Returns `null` when there aren't enough prior days
 * (< `minSamples`) or the average is zero — callers surface "—", never a wrong
 * number.
 */
export function computeRelativeVolume(
  dailyVolumes: number[],
  opts?: { lookback?: number; minSamples?: number },
): RelativeVolume | null {
  const lookback = opts?.lookback ?? REL_VOLUME_LOOKBACK;
  const minSamples = opts?.minSamples ?? REL_VOLUME_MIN_SAMPLES;
  if (dailyVolumes.length < minSamples + 1) return null;
  const current = dailyVolumes[dailyVolumes.length - 1];
  const baseline = dailyVolumes.slice(-1 - lookback, -1);
  if (baseline.length < minSamples) return null;
  const average = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
  if (!(average > 0)) return null;
  return { ratio: current / average, current, average, samples: baseline.length };
}

export type RelVolBand = "high" | "average" | "low";

/**
 * Band a ratio for tone/labelling. `high` ≈ breakout-confirming volume; `low` ≈
 * quiet/declining (constructive for a pullback); `average` is in between.
 */
export function relativeVolumeBand(ratio: number): RelVolBand {
  if (ratio >= REL_VOLUME_BREAKOUT_MIN) return "high";
  if (ratio < REL_VOLUME_QUIET_MAX) return "low";
  return "average";
}

/** Compact display, e.g. `1.4× avg`, `0.6× avg`. */
export function formatRelativeVolume(ratio: number): string {
  return `${ratio.toFixed(ratio >= 10 ? 0 : 1)}× avg`;
}
