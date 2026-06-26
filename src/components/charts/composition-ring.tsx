/**
 * Composition donut for a portfolio / sector mix. Uses the restrained
 * categorical palette (chart-1…6 — the ONLY place it's allowed) and pairs the
 * ring with a legend grid showing each slice's label, value, and share. Pure
 * SVG; an `aria-label` + a visually-hidden breakdown carry it for screen readers.
 */
export interface CompositionSlice {
  label: string;
  value: number;
  /** Optional formatted value (e.g. "$1,234"); falls back to the share. */
  valueText?: string;
}

// Literal class names so Tailwind emits them (no dynamic `chart-${i}`).
const STROKE = [
  "stroke-chart-1",
  "stroke-chart-2",
  "stroke-chart-3",
  "stroke-chart-4",
  "stroke-chart-5",
  "stroke-chart-6",
];
const SWATCH = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
];

const R = 60;
const CIRC = 2 * Math.PI * R;

export function CompositionRing({
  slices,
  title,
  centerLabel,
  centerValue,
}: {
  slices: CompositionSlice[];
  title: string;
  /** Small caption under the big center value. */
  centerLabel?: string;
  /** Big number in the ring's center (e.g. a count or total). */
  centerValue?: string;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return (
      <div className="grid h-40 place-items-center text-sm text-fg-muted">
        No composition to show yet.
      </div>
    );
  }

  const fracs = slices.map((s) => Math.max(0, s.value) / total);
  const arcs = slices.map((s, i) => {
    const dash = fracs[i] * CIRC;
    const prior = fracs.slice(0, i).reduce((a, b) => a + b, 0) * CIRC;
    return {
      key: `${s.label}-${i}`,
      stroke: STROKE[i % STROKE.length],
      dasharray: `${dash} ${CIRC - dash}`,
      dashoffset: -prior,
    };
  });

  const summary = `${title}: ${slices
    .map((s) => `${s.label} ${(Math.max(0, s.value) / total * 100).toFixed(0)}%`)
    .join(", ")}.`;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 150 150"
          className="size-36"
          role="img"
          aria-label={summary}
        >
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            className="stroke-surface-overlay"
            strokeWidth={14}
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="75"
              cy="75"
              r={R}
              fill="none"
              className={a.stroke}
              strokeWidth={14}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="butt"
              transform="rotate(-90 75 75)"
            />
          ))}
        </svg>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums text-fg">
              {centerValue}
            </span>
            {centerLabel ? (
              <span className="text-[0.7rem] uppercase tracking-wide text-fg-muted">
                {centerLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <dl className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {slices.map((s, i) => (
          <div key={`${s.label}-${i}`} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-[3px] ${SWATCH[i % SWATCH.length]}`}
            />
            <dt className="truncate text-fg-muted">{s.label}</dt>
            <dd className="ml-auto tabular-nums font-medium text-fg">
              {s.valueText ?? `${((Math.max(0, s.value) / total) * 100).toFixed(0)}%`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
