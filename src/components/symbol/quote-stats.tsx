import { formatCurrency, formatDateTime } from "@/lib/format";
import type { SymbolQuote } from "@/lib/symbol";

function fmt(value: number | null): string {
  return value === null ? "—" : formatCurrency(value);
}

function fmtVolume(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/** Quote stat grid from the Alpaca IEX snapshot. Honest about the data source. */
export function QuoteStats({ quote }: { quote: SymbolQuote }) {
  const dayRange =
    quote.dayLow !== null && quote.dayHigh !== null
      ? `${formatCurrency(quote.dayLow)} – ${formatCurrency(quote.dayHigh)}`
      : "—";
  const weekRange =
    quote.week52Low !== null && quote.week52High !== null
      ? `${formatCurrency(quote.week52Low)} – ${formatCurrency(quote.week52High)}`
      : "—";

  return (
    <div className="rounded-card border border-line bg-surface-raised p-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label="Open" value={fmt(quote.open)} />
        <Stat label="Prev close" value={fmt(quote.prevClose)} />
        <Stat label="Volume" value={fmtVolume(quote.volume)} />
        <Stat label="Day range" value={dayRange} />
        <Stat label="52-wk range" value={weekRange} />
      </dl>
      <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">
        Source: Alpaca · <span className="font-medium">IEX</span> feed (not the
        consolidated tape; may differ from your broker)
        {quote.asOf ? ` · as of ${formatDateTime(quote.asOf)}` : ""}
      </p>
    </div>
  );
}
