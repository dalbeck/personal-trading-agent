"use client";

import { useRef, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  DEFAULT_RANGE,
  SYMBOL_RANGES,
  type SymbolPricePoint,
  type SymbolRange,
} from "@/lib/symbol";

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
  const abortRef = useRef<AbortController | null>(null);

  async function selectRange(next: SymbolRange) {
    if (next === range) return;
    setRange(next);
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

      <div className="relative">
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
        <p className="sr-only">{summary}</p>
      </div>
    </div>
  );
}
