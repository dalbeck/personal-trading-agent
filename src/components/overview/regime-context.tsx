import { Card } from "@/components/page-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import type { RegimeContext, TrendState } from "@/lib/regime";

/**
 * Advisory market-regime strip on the Overview (M4). A one-line read of the
 * macro backdrop — SPY trend, VIX band, and which sectors money is rotating
 * into / out of — so proposals lean with the tape. **Advisory context only**:
 * it is not a rail, not a gate, and it sizes nothing. Clearly labelled as such.
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

export function RegimeContextStrip({ regime }: { regime: RegimeContext }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="muted" dot>
          MARKET REGIME
        </Badge>
        <Badge tone={TREND_TONE[regime.trend]}>{TREND_LABEL[regime.trend]}</Badge>
        <span className="text-xs uppercase tracking-wide text-fg-muted">
          VIX {regime.vix != null ? regime.vix.toFixed(1) : "—"} · {regime.vixBand}
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-fg-muted">
          Advisory only
        </span>
      </div>

      <p className="mt-2 text-pretty text-sm text-fg">{regime.summary}</p>

      {regime.leaders.length > 0 || regime.laggards.length > 0 ? (
        <dl className="mt-3 grid gap-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
          {regime.leaders.length > 0 ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Leading (vs SPY)
              </dt>
              <dd className="mt-1 flex flex-col gap-0.5">
                {regime.leaders.map((s) => (
                  <span key={s.symbol} className="flex justify-between gap-2">
                    <span className="text-fg">{s.name}</span>
                    <span className="tabular-nums text-gain">
                      {formatPercent(s.relativePct, { signed: true })}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {regime.laggards.length > 0 ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Lagging (vs SPY)
              </dt>
              <dd className="mt-1 flex flex-col gap-0.5">
                {regime.laggards.map((s) => (
                  <span key={s.symbol} className="flex justify-between gap-2">
                    <span className="text-fg">{s.name}</span>
                    <span className="tabular-nums text-loss">
                      {formatPercent(s.relativePct, { signed: true })}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </Card>
  );
}
