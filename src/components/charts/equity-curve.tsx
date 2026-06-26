"use client";

import { type PointerEvent, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EquityPoint } from "@/lib/types";

/**
 * Equity curve — area-fill line for the portfolio plus a benchmark (SPY)
 * reference line synthesized from the period return (we persist only the scalar
 * benchmark return, so it renders straight from the starting equity). The
 * portfolio series uses the blue accent (a neutral series; gain/loss is reserved
 * for P&L). Interactive to match the symbol price chart: restrained gridlines, a
 * persistent last-point dot, and a hover crosshair + tooltip.
 */
const W = 640;
const H = 200;
const PAD = 12;
const GRID_LINES = 4;

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

export function EquityCurve({
  points,
  benchmarkReturnPct,
}: {
  points: EquityPoint[];
  benchmarkReturnPct?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="grid h-48 place-items-center text-sm text-fg-muted">
        Not enough history to chart yet.
      </div>
    );
  }

  const portfolio = points.map((p) => p.equity);
  const n = portfolio.length;
  const start = portfolio[0];
  const benchmark =
    benchmarkReturnPct === undefined
      ? null
      : portfolio.map(
          (_, i) => start * (1 + benchmarkReturnPct * (i / (n - 1))),
        );

  const all = benchmark ? [...portfolio, ...benchmark] : portfolio;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;

  const portfolioPath = linePath(portfolio, min, max);
  const benchmarkPath = benchmark ? linePath(benchmark, min, max) : "";
  const areaPath = `${portfolioPath} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;

  function pointPosition(i: number, value: number) {
    const xVb = PAD + (i / (n - 1)) * (W - 2 * PAD);
    const yVb = H - PAD - ((value - min) / span) * (H - 2 * PAD);
    return { xPct: (xVb / W) * 100, yPct: (yVb / H) * 100 };
  }
  function handlePointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const fracX = (e.clientX - rect.left) / rect.width;
    const plotFrac = (fracX * W - PAD) / (W - 2 * PAD);
    const i = Math.max(0, Math.min(n - 1, Math.round(plotFrac * (n - 1))));
    setHoverIndex(i);
  }

  const lastPos = pointPosition(n - 1, portfolio[n - 1]);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverPos =
    hoverIndex !== null
      ? pointPosition(hoverIndex, portfolio[hoverIndex])
      : null;
  const hoverBench =
    hoverIndex !== null && benchmark ? benchmark[hoverIndex] : null;

  const summary = `Portfolio equity from ${formatCurrency(start)} to ${formatCurrency(
    portfolio[n - 1],
  )} over ${n} points${
    benchmark ? `, versus a SPY reference of ${formatCurrency(benchmark[n - 1])}` : ""
  }.`;

  // Restrained horizontal gridlines at even fractions of the plot height.
  const gridYs = Array.from({ length: GRID_LINES + 1 }, (_, k) => {
    const y = PAD + (k / GRID_LINES) * (H - 2 * PAD);
    return (y / H) * 100;
  });

  return (
    <div
      className="relative"
      style={{ touchAction: "pan-y" }}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={() => setHoverIndex(null)}
      onPointerCancel={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridYs.map((yPct, k) => (
          <line
            key={k}
            x1={0}
            x2={W}
            y1={(yPct / 100) * H}
            y2={(yPct / 100) * H}
            className="stroke-line"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaPath} fill="url(#equityFill)" stroke="none" />

        {benchmarkPath ? (
          <path
            d={benchmarkPath}
            fill="none"
            className="stroke-fg-muted"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <path
          d={portfolioPath}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Persistent highlight on the latest point. */}
      <span
        aria-hidden
        className="pointer-events-none absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent ring-2 ring-surface-raised"
        style={{ left: `${lastPos.xPct}%`, top: `${lastPos.yPct}%` }}
      />

      {hovered && hoverPos ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-line"
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

      <p className="sr-only">{summary}</p>
    </div>
  );
}
