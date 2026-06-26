"use client";

import {
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
} from "@/lib/format";
import { RESEARCH_PROVIDER_LABEL, RESEARCH_PROVIDER_SHORT } from "@/lib/research-display";
import type { SymbolQuote } from "@/lib/symbol";
import { formatRelativeVolume } from "@/lib/volume";
import type { ResearchOrigin } from "@/lib/server/research/types";
import { useSymbolResearch } from "@/components/symbol/research-context";

/**
 * Perplexity-style stats grid. Price / OHLC / ranges / volume are **Alpaca**
 * (rendered immediately from the server-resolved quote). Market cap, P/E and
 * dividend yield come from **Robinhood** `get_equity_fundamentals` (free,
 * read-only) when connected, else Perplexity; EPS is Perplexity-only. Each cell
 * is honestly source-tagged, and Perplexity/Robinhood cells fill in when the
 * auto-loaded research resolves ("—" when neither has it).
 */

type Source = "alpaca" | "robinhood" | "perplexity";

const SOURCE_LABEL: Record<Source, string> = {
  alpaca: "Alpaca",
  robinhood: "Robinhood",
  perplexity: RESEARCH_PROVIDER_SHORT,
};

const SOURCE_TITLE: Record<Source, string> = {
  alpaca: "Alpaca IEX market data",
  robinhood: "Robinhood get_equity_fundamentals (read-only, no metered cost)",
  perplexity: `${RESEARCH_PROVIDER_LABEL} (metered, context only)`,
};

function SourceTag({ source }: { source: Source }) {
  return (
    <span
      className="rounded-pill border border-line px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-muted"
      title={SOURCE_TITLE[source]}
    >
      {SOURCE_LABEL[source]}
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
  const state = useSymbolResearch();
  const loading = state.status === "loading";
  const research = state.status === "loaded" ? state.research : null;
  const f = research?.fundamentals ?? null;

  // The market-cap / P/E / dividend trio is Robinhood-or-Perplexity; reflect the
  // actual origin, falling back to where it *would* come from while empty.
  const trioSource: Source =
    (research?.fundamentalsSource as ResearchOrigin | undefined) ??
    (research?.robinhoodConnected ? "robinhood" : "perplexity");

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
          source={trioSource}
          loading={loading}
        />
        <Cell label="Open" value={money(quote?.open)} source="alpaca" />
        <Cell
          label="P/E"
          value={num(f?.peRatio ?? null)}
          source={trioSource}
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
          source={trioSource}
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
        <Cell
          label="Rel. volume"
          value={
            quote?.relativeVolume == null
              ? "—"
              : formatRelativeVolume(quote.relativeVolume)
          }
          source="alpaca"
        />
      </dl>
      <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">
        <span className="font-medium">Alpaca</span> IEX feed (not the consolidated
        tape) for price &amp; ranges; <span className="font-medium">Robinhood</span>{" "}
        fundamentals (free, read-only) for market cap, P/E &amp; yield, falling
        back to <span className="font-medium">Perplexity</span> (metered, context
        only) — which also supplies EPS.
      </p>
    </section>
  );
}
