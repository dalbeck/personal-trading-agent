/**
 * Shared chart-path math for the SVG line/area charts (equity curve, hero
 * equity chart). Plain module (no `server-only`) so client chart components can
 * import it. One coordinate system, one set of helpers — the equity curve and
 * the hero chart speak the same visual language instead of each hand-rolling
 * its own path code (see `.agents/design-system.md` → Charts & data-viz).
 */

/** The chart viewBox. Rendered with `preserveAspectRatio="none"`, so the SVG
 *  stretches to its CSS box — the viewBox aspect is just the coordinate space. */
export const CHART_W = 640;
export const CHART_H = 200;
export const CHART_PAD = 12;

/** Build an SVG path `d` for a series, scaled into the [min, max] range. */
export function linePath(
  values: number[],
  min: number,
  max: number,
  w = CHART_W,
  h = CHART_H,
  pad = CHART_PAD,
): string {
  const n = values.length;
  if (n < 2) return "";
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (n - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Close a line path into a filled area down to the baseline. */
export function areaPath(
  line: string,
  w = CHART_W,
  h = CHART_H,
  pad = CHART_PAD,
): string {
  if (!line) return "";
  return `${line} L${w - pad} ${h - pad} L${pad} ${h - pad} Z`;
}

/** The on-screen position of point `i` as viewBox-relative percentages, so an
 *  HTML overlay (dot, crosshair, tooltip) can sit on top of the stretched SVG. */
export function pointPosition(
  i: number,
  value: number,
  n: number,
  min: number,
  max: number,
  w = CHART_W,
  h = CHART_H,
  pad = CHART_PAD,
): { xPct: number; yPct: number } {
  const span = max - min || 1;
  const xVb = pad + (i / (n - 1)) * (w - 2 * pad);
  const yVb = h - pad - ((value - min) / span) * (h - 2 * pad);
  return { xPct: (xVb / w) * 100, yPct: (yVb / h) * 100 };
}

/**
 * Honest range-slicing for the hero chart's 1W / 1M / 1Y tabs: keep only the
 * points within `days` of the latest point. We never synthesize data — a range
 * just narrows the real series, and a window with < 2 points is dropped by the
 * caller so we don't show an empty tab.
 */
export function sliceByDays<T extends { date: string }>(
  points: T[],
  days: number,
): T[] {
  if (points.length === 0) return points;
  const last = new Date(points[points.length - 1].date).getTime();
  if (!Number.isFinite(last)) return points;
  const cutoff = last - days * 24 * 60 * 60 * 1000;
  const windowed = points.filter((p) => new Date(p.date).getTime() >= cutoff);
  return windowed.length >= 2 ? windowed : points;
}
