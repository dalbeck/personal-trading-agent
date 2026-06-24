import { formatCurrency, formatPercent } from "@/lib/format";
import {
  computeRiskReward,
  describeRiskReward,
  formatRatio,
  type TradeAction,
} from "@/lib/risk-reward";

/**
 * Risk/reward bar for a proposal card. A horizontal track split into a risk
 * zone (entry → stop, loss color) and a reward zone (entry → target, gain
 * color), widths proportional to the price distances, with an entry marker at
 * the boundary. The reward-to-risk ratio reads prominently; confidence shows as
 * a small meter. The bar is decorative (`aria-hidden`) — a visually-hidden
 * sentence carries the same information for screen readers.
 *
 * Degrades gracefully: a proposal with no defined stop or target shows
 * "No defined target" (plus the confidence meter, if any) rather than a broken,
 * zero-width bar. Renders nothing when there is neither a bar nor a confidence.
 */
export function RiskRewardBar({
  action,
  entry,
  stop,
  target,
  confidence,
}: {
  action: TradeAction;
  entry: number;
  stop: number | null;
  target: number | null;
  confidence: number | null;
}) {
  const rr = computeRiskReward({ action, entry, stop, target });
  if (!rr && confidence === null) return null;

  const riskPct = rr ? rr.riskFraction * 100 : 0;

  return (
    <div className="mt-3 rounded-card border border-line bg-surface-overlay p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Reward : risk
          </span>
          {rr ? (
            <span className="text-base font-semibold tabular-nums text-fg">
              {formatRatio(rr.ratio)}
            </span>
          ) : (
            <span className="text-sm text-fg-muted">No defined target</span>
          )}
        </div>
        {confidence !== null ? <ConfidenceMeter value={confidence} /> : null}
      </div>

      {rr && stop !== null && target !== null ? (
        <>
          <div
            aria-hidden
            className="relative mt-3 flex h-2.5 w-full overflow-hidden rounded-pill bg-surface"
          >
            <div
              className="h-full bg-loss/80"
              style={{ width: `${riskPct}%` }}
            />
            <div className="h-full flex-1 bg-gain/80" />
            <span
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg"
              style={{ left: `${riskPct}%` }}
            />
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2 text-xs tabular-nums">
            <span className="text-fg-muted">
              Stop{" "}
              <span className="font-medium text-loss">
                {formatCurrency(stop)}
              </span>{" "}
              <span className="text-loss">
                ({formatPercent(rr.stopPctFromEntry)})
              </span>
            </span>
            <span className="text-fg-muted">
              Entry{" "}
              <span className="font-medium text-fg">
                {formatCurrency(entry)}
              </span>
            </span>
            <span className="text-fg-muted">
              Target{" "}
              <span className="font-medium text-gain">
                {formatCurrency(target)}
              </span>{" "}
              <span className="text-gain">
                ({formatPercent(rr.targetPctFromEntry)})
              </span>
            </span>
          </div>

          <span className="sr-only">
            {describeRiskReward({ action, entry, stop, target, rr })}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** A small confidence meter: a thin filled track plus the percentage. */
function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-muted">Confidence</span>
      <div
        role="meter"
        aria-label="Model confidence"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-16 overflow-hidden rounded-pill bg-surface"
      >
        <div
          className="h-full rounded-pill bg-fg-muted"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums text-fg">{pct}%</span>
    </div>
  );
}
