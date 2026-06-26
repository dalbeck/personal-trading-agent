/**
 * Diverging bar chart primitive (.agents/design-system.md → Charts & data-viz):
 * horizontal bars growing out from a center zero line — positive to the right
 * in the gain tone, negative to the left in the loss tone. Used for
 * sector-rotation (relative-to-SPY) on the Overview, reusable for any
 * signed-around-zero series. Pure presentation; the caller supplies an
 * `ariaLabel` text equivalent for the whole chart.
 */
export interface DivergingRow {
  /** Row label (e.g. a sector name). */
  label: string;
  /** Signed magnitude that sets the bar's side + length. */
  value: number;
  /** Formatted value shown at the row's end (e.g. "+23.50%"). */
  valueText: string;
}

export function DivergingBars({
  rows,
  ariaLabel,
}: {
  rows: DivergingRow[];
  ariaLabel?: string;
}) {
  // Scale every bar to the largest magnitude so the widest fills ~half the track.
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex flex-col gap-2.5"
    >
      {rows.map((r) => {
        const pos = r.value >= 0;
        const pct = (Math.abs(r.value) / maxAbs) * 50;
        return (
          <div
            key={r.label}
            className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2.5 text-xs"
          >
            <span className="truncate text-fg" title={r.label}>
              {r.label}
            </span>
            <span aria-hidden className="relative h-3.5">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-fg-muted/35" />
              <span
                className={`absolute top-1/2 h-2.5 -translate-y-1/2 ${
                  pos
                    ? "rounded-r-[5px] bg-gain"
                    : "rounded-l-[5px] bg-loss"
                }`}
                style={
                  pos
                    ? { left: "50%", width: `${pct}%` }
                    : { right: "50%", width: `${pct}%` }
                }
              />
            </span>
            <span
              className={`text-right tabular-nums ${pos ? "text-gain" : "text-loss"}`}
            >
              {r.valueText}
            </span>
          </div>
        );
      })}
    </div>
  );
}
