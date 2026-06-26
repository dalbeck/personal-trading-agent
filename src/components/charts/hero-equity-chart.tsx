"use client";

import { type PointerEvent, useMemo, useState } from "react";
import {
  CHART_H,
  CHART_PAD,
  CHART_W,
  areaPath,
  linePath,
  pointPosition,
  sliceByDays,
} from "@/lib/chart-path";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EquityPoint } from "@/lib/types";

/**
 * The hero's equity chart (M1 reference rebuild): a large area curve that lives
 * INSIDE the gradient hero, with honest 1W / 1M / 1Y range tabs, a vivid
 * gradient fill, a glowing endpoint, and the same hover crosshair + tooltip the
 * symbol chart uses. Same visual language as `EquityCurve` (shared `chart-path`
 * math) — this is the showcase variant tuned to ride the hero surface.
 *
 * Range tabs only narrow the real series (`sliceByDays`); a window with too few
 * points is never shown, and nothing is ever synthesized.
 */
const RANGES: { key: string; label: string; days: number }[] = [
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "1Y", label: "1Y", days: 365 },
];

export function HeroEquityChart({
  points,
  benchmarkReturnPct,
}: {
  points: EquityPoint[];
  benchmarkReturnPct?: number;
}) {
  const total = points.length;

  // Which range tabs actually have a distinct, chartable window of data.
  const tabs = useMemo(() => {
    if (total < 2) return [{ key: "ALL", label: "All", days: Infinity }];
    const last = new Date(points[total - 1].date).getTime();
    const avail = RANGES.filter((r) => {
      const cutoff = last - r.days * 86_400_000;
      const c = points.filter((p) => new Date(p.date).getTime() >= cutoff).length;
      return c >= 2 && c < total;
    });
    return [...avail, { key: "ALL", label: "All", days: Infinity }];
  }, [points, total]);

  const [active, setActive] = useState(tabs[tabs.length - 1].key);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[tabs.length - 1];
  const series =
    activeTab.days === Infinity ? points : sliceByDays(points, activeTab.days);

  if (series.length < 2) {
    return (
      <div className="grid h-44 place-items-center text-sm text-fg-muted">
        Not enough history to chart yet.
      </div>
    );
  }

  const portfolio = series.map((p) => p.equity);
  const n = portfolio.length;
  const start = portfolio[0];
  const benchmark =
    benchmarkReturnPct === undefined
      ? null
      : portfolio.map((_, i) => start * (1 + benchmarkReturnPct * (i / (n - 1))));

  const all = benchmark ? [...portfolio, ...benchmark] : portfolio;
  const min = Math.min(...all);
  const max = Math.max(...all);

  const line = linePath(portfolio, min, max);
  const area = areaPath(line);
  const benchLine = benchmark ? linePath(benchmark, min, max) : "";

  const lastVal = portfolio[n - 1];
  const lastX = CHART_PAD + (CHART_W - 2 * CHART_PAD);
  const span = max - min || 1;
  const lastY = CHART_H - CHART_PAD - ((lastVal - min) / span) * (CHART_H - 2 * CHART_PAD);

  function handlePointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const fracX = (e.clientX - rect.left) / rect.width;
    const plotFrac = (fracX * CHART_W - CHART_PAD) / (CHART_W - 2 * CHART_PAD);
    const i = Math.max(0, Math.min(n - 1, Math.round(plotFrac * (n - 1))));
    setHoverIndex(i);
  }

  const hovered = hoverIndex !== null ? series[hoverIndex] : null;
  const hoverPos =
    hoverIndex !== null
      ? pointPosition(hoverIndex, portfolio[hoverIndex], n, min, max)
      : null;
  const hoverBench =
    hoverIndex !== null && benchmark ? benchmark[hoverIndex] : null;

  const summary = `Portfolio equity from ${formatCurrency(start)} to ${formatCurrency(
    lastVal,
  )} over ${n} points (${activeTab.label})${
    benchmark ? `, versus a SPY reference of ${formatCurrency(benchmark[n - 1])}` : ""
  }.`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">
          {activeTab.days === Infinity ? "Since inception" : `Last ${activeTab.label}`}
        </span>
        {tabs.length > 1 ? (
          <div
            className="flex items-center gap-1"
            role="tablist"
            aria-label="Equity chart range"
          >
            {tabs.map((t) => {
              const on = t.key === active;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setActive(t.key);
                    setHoverIndex(null);
                  }}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                    on
                      ? "bg-accent text-accent-foreground"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div
        className="relative"
        style={{ touchAction: "pan-y" }}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerCancel={() => setHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-44 w-full md:h-52"
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
        >
          <defs>
            <linearGradient id="heroEquityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
            <filter id="heroEquityGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          <path d={area} fill="url(#heroEquityFill)" stroke="none" />

          {benchLine ? (
            <path
              d={benchLine}
              fill="none"
              className="stroke-fg-muted"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          <path
            d={line}
            fill="none"
            className="stroke-accent"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* glowing endpoint */}
          <circle
            cx={lastX}
            cy={lastY}
            r={11}
            className="fill-accent"
            opacity={0.32}
            filter="url(#heroEquityGlow)"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={lastX}
            cy={lastY}
            r={4.5}
            className="fill-accent stroke-surface-raised"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {hovered && hoverPos ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-fg-muted/30"
              style={{ left: `${hoverPos.xPct}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent ring-2 ring-surface-raised"
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
                  {formatDate(hovered.date)}
                </div>
                <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                  <dt className="flex items-center gap-1.5 text-fg-muted">
                    <span className="size-1.5 rounded-pill bg-accent" />
                    Portfolio
                  </dt>
                  <dd className="text-right font-semibold text-fg">
                    {formatCurrency(hovered.equity)}
                  </dd>
                  {hoverBench !== null ? (
                    <>
                      <dt className="flex items-center gap-1.5 text-fg-muted">
                        <span className="h-0 w-3 border-t border-dashed border-fg-muted" />
                        SPY
                      </dt>
                      <dd className="text-right text-fg">
                        {formatCurrency(hoverBench)}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <p className="sr-only">{summary}</p>
    </div>
  );
}
