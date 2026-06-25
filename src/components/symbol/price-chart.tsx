"use client";

import { type PointerEvent, useRef, useState } from "react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
} from "@/lib/format";
import {
  DEFAULT_RANGE,
  nearestIndex,
  SYMBOL_RANGES,
  type SymbolPricePoint,
  type SymbolRange,
} from "@/lib/symbol";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const W = 720;
const H = 240;
const PAD = 14;

const RANGE_LABEL: Record<SymbolRange, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "1Y": "1 year",
};

function linePath(values: number[], min: number, max: number): string {
  const n = values.length;
  if (n < 2) return "";
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = PAD + (i / (n - 1)) * (W - 2 * PAD);
      const y = H - PAD - ((v - min) / span) * (H - 2 * PAD);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Symbol price chart with range tabs. Initial series is server-rendered; range
 * switches fetch the close series from the keys-never-leave-server API route and
 * cache per range. Dependency-free SVG line, colored by the period direction
 * (gain/loss — trading semantics, not the brand accent). Accessible: a labeled
 * segmented control plus a text summary for screen readers.
 */
export function PriceChart({
  symbol,
  initialPoints,
  initialRange = DEFAULT_RANGE,
}: {
  symbol: string;
  initialPoints: SymbolPricePoint[];
  initialRange?: SymbolRange;
}) {
  const [range, setRange] = useState<SymbolRange>(initialRange);
  const [cache, setCache] = useState<Record<string, SymbolPricePoint[]>>({
    [initialRange]: initialPoints,
  });
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function selectRange(next: SymbolRange) {
    if (next === range) return;
    setRange(next);
    setHoverIndex(null); // stale index across a different series
    if (cache[next]) return; // already loaded

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/symbol/${encodeURIComponent(symbol)}/bars?range=${next}`,
        { signal: controller.signal },
      );
      const data = (await res.json()) as { points?: SymbolPricePoint[] };
      setCache((c) => ({ ...c, [next]: data.points ?? [] }));
    } catch {
      if (!controller.signal.aborted) {
        setCache((c) => ({ ...c, [next]: [] }));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const points = cache[range] ?? [];
  const closes = points.map((p) => p.c);
  const hasChart = closes.length >= 2;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const up = hasChart ? last >= first : true;
  const periodChange = hasChart ? last - first : 0;
  const periodPct = hasChart && first ? periodChange / first : 0;

  const min = hasChart ? Math.min(...closes) : 0;
  const max = hasChart ? Math.max(...closes) : 0;
  const path = linePath(closes, min, max);
  const area = `${path} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;

  // Hover crosshair geometry. The SVG stretches (preserveAspectRatio="none"),
  // so viewBox coords map linearly to the rendered box — percentages place the
  // overlay precisely on top of the line in both axes.
  const n = closes.length;
  const span = max - min || 1;
  function pointPosition(i: number) {
    const xVb = PAD + (n > 1 ? (i / (n - 1)) * (W - 2 * PAD) : 0);
    const yVb = H - PAD - ((closes[i] - min) / span) * (H - 2 * PAD);
    return { xPct: (xVb / W) * 100, yPct: (yVb / H) * 100 };
  }
  function handlePointer(e: PointerEvent<HTMLDivElement>) {
    if (!hasChart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const fracX = (e.clientX - rect.left) / rect.width;
    const plotFrac = (fracX * W - PAD) / (W - 2 * PAD);
    setHoverIndex(nearestIndex(plotFrac, n));
  }
  const hovered =
    hoverIndex != null && hoverIndex < points.length
      ? points[hoverIndex]
      : null;
  const hoverPos = hovered ? pointPosition(hoverIndex as number) : null;
  // Intraday ranges get a time; daily ranges just a date.
  const intraday = range === "1D" || range === "1W";

  const summary = hasChart
    ? `${symbol} ${RANGE_LABEL[range]} price chart. ${formatCurrency(
        first,
      )} to ${formatCurrency(last)}, ${
        up ? "up" : "down"
      } ${formatCurrency(Math.abs(periodChange))} (${formatPercent(periodPct)}). ` +
      `Range ${formatCurrency(min)} to ${formatCurrency(max)}.`
    : `${symbol} ${RANGE_LABEL[range]} price chart — no data available.`;

  return (
    <div className="rounded-card border border-line bg-surface-raised p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-fg">Price</h2>
          {hasChart ? (
            <span
              className={`text-xs font-medium tabular-nums ${
                up ? "text-gain" : "text-loss"
              }`}
            >
              {formatCurrency(periodChange, { signed: true })} (
              {formatPercent(periodPct)}) · {RANGE_LABEL[range]}
            </span>
          ) : null}
        </div>
        <div
          role="group"
          aria-label="Chart time range"
          className="flex gap-1 rounded-pill border border-line p-0.5"
        >
          {SYMBOL_RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => selectRange(r)}
                className={`rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="relative"
        style={{ touchAction: "pan-y" }}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerCancel={() => setHoverIndex(null)}
      >
        {loading ? (
          <div
            aria-hidden
            className="absolute inset-0 z-10 grid place-items-center rounded-card bg-surface-raised/60"
          >
            <span className="text-xs text-fg-muted">Loading…</span>
          </div>
        ) : null}

        {hasChart ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className={`h-60 w-full ${up ? "text-gain" : "text-loss"}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={summary}
          >
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#priceFill)" stroke="none" />
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="grid h-60 place-items-center text-sm text-fg-muted">
            {loading ? "Loading…" : "No price history for this range."}
          </div>
        )}

        {hovered && hoverPos ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-line"
              style={{ left: `${hoverPos.xPct}%` }}
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill ring-2 ring-surface-raised ${
                up ? "bg-gain" : "bg-loss"
              }`}
              style={{ left: `${hoverPos.xPct}%`, top: `${hoverPos.yPct}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute top-1.5 z-20"
              style={{ left: `${hoverPos.xPct}%` }}
            >
              <div
                className="w-max rounded-card border border-line bg-surface-overlay px-3 py-2 text-xs shadow-overlay"
                style={{
                  transform:
                    hoverPos.xPct > 60
                      ? "translateX(calc(-100% - 8px))"
                      : "translateX(8px)",
                }}
              >
                <div className="mb-1.5 font-medium text-fg">
                  {intraday
                    ? formatDateTime(hovered.t)
                    : formatDate(hovered.t.slice(0, 10))}
                </div>
                <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                  <dt className="text-fg-muted">Open</dt>
                  <dd className="text-right text-fg">
                    {formatCurrency(hovered.o)}
                  </dd>
                  <dt className="text-fg-muted">High</dt>
                  <dd className="text-right text-fg">
                    {formatCurrency(hovered.h)}
                  </dd>
                  <dt className="text-fg-muted">Low</dt>
                  <dd className="text-right text-fg">
                    {formatCurrency(hovered.l)}
                  </dd>
                  <dt className="text-fg-muted">Close</dt>
                  <dd className="text-right font-semibold text-fg">
                    {formatCurrency(hovered.c)}
                  </dd>
                  <dt className="text-fg-muted">Volume</dt>
                  <dd className="text-right text-fg">
                    {compactNumber.format(hovered.v)}
                  </dd>
                </dl>
              </div>
            </div>
          </>
        ) : null}

        <p className="sr-only">{summary}</p>
      </div>
    </div>
  );
}
