"use client";

import {
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
} from "@/lib/format";
import type { SymbolQuote } from "@/lib/symbol";
import { useSymbolResearch } from "@/components/symbol/research-context";

/**
 * Perplexity-style stats grid. Price / OHLC / ranges / volume are **Alpaca**
 * (rendered immediately from the server-resolved quote); market cap, P/E, EPS
 * and dividend yield are **Perplexity** (filled in when the auto-loaded research
 * resolves, "—" when it's off / capped). Each cell is honestly source-tagged.
 */

type Source = "alpaca" | "perplexity";

function SourceTag({ source }: { source: Source }) {
  return (
    <span
      className="rounded-pill border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-muted"
      title={
        source === "alpaca"
          ? "Alpaca IEX market data"
          : "Perplexity finance_search (metered, context only)"
      }
    >
      {source === "alpaca" ? "Alpaca" : "Perplexity"}
    </span>
  );
}

function Cell({
  label,
  value,
  source,
  loading = false,
}: {
  label: string;
  value: string;
  source: Source;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {label}
        </span>
        <SourceTag source={source} />
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-fg">
        {loading ? (
          <span
            className="inline-block h-4 w-16 animate-pulse rounded bg-surface-overlay align-middle"
            aria-hidden
          />
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function rangeText(low: number | null, high: number | null): string {
  return low !== null && high !== null
    ? `${formatCurrency(low)} – ${formatCurrency(high)}`
    : "—";
}

export function SymbolStatsGrid({ quote }: { quote: SymbolQuote | null }) {
  const research = useSymbolResearch();
  const loading = research.status === "loading";
  const f = research.status === "loaded" ? research.result.fundamentals : null;

  const money = (v: number | null | undefined) =>
    v == null ? "—" : formatCurrency(v);
  const num = (v: number | null) =>
    v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <section
      aria-labelledby="stats-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <h2 id="stats-heading" className="mb-4 text-sm font-semibold text-fg">
        Key statistics
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Cell label="Prev close" value={money(quote?.prevClose)} source="alpaca" />
        <Cell
          label="Market cap"
          value={f?.marketCap != null ? formatCompactCurrency(f.marketCap) : "—"}
          source="perplexity"
          loading={loading}
        />
        <Cell label="Open" value={money(quote?.open)} source="alpaca" />
        <Cell
          label="P/E"
          value={num(f?.peRatio ?? null)}
          source="perplexity"
          loading={loading}
        />
        <Cell
          label="Day range"
          value={rangeText(quote?.dayLow ?? null, quote?.dayHigh ?? null)}
          source="alpaca"
        />
        <Cell
          label="Dividend yield"
          value={
            f?.dividendYield != null
              ? formatPercent(f.dividendYield, { signed: false })
              : "—"
          }
          source="perplexity"
          loading={loading}
        />
        <Cell
          label="52-wk range"
          value={rangeText(quote?.week52Low ?? null, quote?.week52High ?? null)}
          source="alpaca"
        />
        <Cell
          label="EPS"
          value={num(f?.eps ?? null)}
          source="perplexity"
          loading={loading}
        />
        <Cell
          label="Volume"
          value={quote?.volume == null ? "—" : formatCompactNumber(quote.volume)}
          source="alpaca"
        />
      </dl>
      <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">
        <span className="font-medium">Alpaca</span> IEX feed (not the consolidated
        tape) for price &amp; ranges; <span className="font-medium">Perplexity</span>{" "}
        finance_search (metered, context only) for market cap, P/E, EPS &amp;
        yield.
      </p>
    </section>
  );
}
