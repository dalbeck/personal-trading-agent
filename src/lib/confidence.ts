export type ConfidenceLevel = "Low" | "Moderate" | "High";

export interface ConfidenceBucket {
  level: ConfidenceLevel;
  /** The confidence as a whole percent (0–100), rounded — this is what's shown. */
  pct: number;
  /** Filled segments of the meter, 0…`segments`. */
  filled: number;
  segments: number;
}

const DEFAULT_SEGMENTS = 5;

/**
 * Bucket a model-confidence fraction (0–1) into a labeled level plus segmented
 * meter fill. This is a **presentation** helper — the number is the model's own
 * self-rating, uncalibrated, not a probability.
 *
 * Thresholds are applied to the rounded percent (what the UI shows), so the
 * label always agrees with the displayed number: **Low < 40 · Moderate 40–69 ·
 * High ≥ 70**.
 */
export function confidenceBucket(
  value: number,
  segments: number = DEFAULT_SEGMENTS,
): ConfidenceBucket {
  const pct = Math.round(clamp01(value) * 100);
  const level: ConfidenceLevel =
    pct >= 70 ? "High" : pct >= 40 ? "Moderate" : "Low";
  const filled =
    pct === 0
      ? 0
      : Math.min(segments, Math.max(1, Math.round((pct / 100) * segments)));
  return { level, pct, filled, segments };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
