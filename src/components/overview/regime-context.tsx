import { Card } from "@/components/page-shell";
import { DivergingBars, type DivergingRow } from "@/components/charts/diverging-bars";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import type { RegimeContext, TrendState } from "@/lib/regime";

/**
 * Advisory market-regime card on the Overview (M1 reference rebuild). The macro
 * backdrop — SPY trend, VIX band, and which sectors money is rotating into / out
 * of — visualized as **sector-rotation diverging bars** (leaders right/green,
 * laggards left/red) instead of a text table. **Advisory context only**: it is
 * not a rail, not a gate, and it sizes nothing. Clearly labelled as such.
 */

const TREND_TONE: Record<TrendState, BadgeTone> = {
  uptrend: "gain",
  range: "muted",
  downtrend: "loss",
};

const TREND_LABEL: Record<TrendState, string> = {
  uptrend: "Uptrend",
  range: "Range",
  downtrend: "Downtrend",
};

export function MarketRegimeCard({ regime }: { regime: RegimeContext }) {
  // Merge leaders + laggards into one list, strongest-relative first, so the
  // diverging bars read top-to-bottom from most-leading to most-lagging.
  const ranked = [...regime.leaders, ...regime.laggards].sort(
    (a, b) => b.relativePct - a.relativePct,
  );
  const rows: DivergingRow[] = ranked.map((s) => ({
    label: s.name,
    value: s.relativePct,
    valueText: formatPercent(s.relativePct),
  }));

  const barsLabel =
    rows.length > 0
      ? `Sector rotation versus SPY: ${ranked
          .map((s) => `${s.name} ${formatPercent(s.relativePct)}`)
          .join(", ")}.`
      : undefined;

  return (
    <Card className="overflow-hidden">
      <div className="tint-strip -mx-5 -mt-5 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line/60 px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
            Market regime
          </h2>
          <Badge tone={TREND_TONE[regime.trend]}>
            {TREND_LABEL[regime.trend]}
          </Badge>
          <span className="text-xs uppercase tracking-wide text-fg-muted">
            VIX {regime.vix != null ? regime.vix.toFixed(1) : "—"} · {regime.vixBand}
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          Advisory only
        </span>
      </div>

      <p className="text-pretty text-sm text-fg-muted">{regime.summary}</p>

      {rows.length > 0 ? (
        <div className="mt-4 border-t border-line/60 pt-4">
          <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            <span>Lagging vs SPY</span>
            <span>Leading vs SPY</span>
          </div>
          <DivergingBars rows={rows} ariaLabel={barsLabel} />
        </div>
      ) : null}
    </Card>
  );
}
