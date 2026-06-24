import type { EquityPoint } from "@/lib/types";

/**
 * Minimal dependency-free equity curve. Draws the portfolio line plus a
 * benchmark (SPY) reference line synthesized from the period return — we only
 * persist the scalar benchmark return, so the benchmark is rendered as a
 * straight reference from the starting equity to start × (1 + return).
 */
const W = 640;
const H = 200;
const PAD = 12;

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
  if (points.length < 2) {
    return (
      <div className="grid h-48 place-items-center text-sm text-fg-muted">
        Not enough history to chart yet.
      </div>
    );
  }

  const portfolio = points.map((p) => p.equity);
  const start = portfolio[0];
  const benchmark =
    benchmarkReturnPct === undefined
      ? null
      : portfolio.map(
          (_, i) =>
            start *
            (1 + benchmarkReturnPct * (i / (portfolio.length - 1))),
        );

  const all = benchmark ? [...portfolio, ...benchmark] : portfolio;
  const min = Math.min(...all);
  const max = Math.max(...all);

  const portfolioPath = linePath(portfolio, min, max);
  const benchmarkPath = benchmark ? linePath(benchmark, min, max) : "";
  const areaPath = `${portfolioPath} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-48 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Portfolio equity curve versus the SPY benchmark"
    >
      <defs>
        <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

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
  );
}
