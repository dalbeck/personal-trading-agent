import { ModuleCard } from "@/components/overview/module-card";
import type { Guardrails } from "@/lib/server/overview";

/**
 * Guardrail headroom — how much room is left against each hard risk rail
 * (drawdown halt, daily order cap, max concurrent positions). Bars show the
 * consumed fraction; the caption states the remaining headroom. The numbers
 * come from the risk-engine config (`RISK_LIMITS`) and the current paper
 * snapshot — the same snapshot the KPI row shows.
 */
export function GuardrailHeadroom({ guardrails }: { guardrails: Guardrails }) {
  const { drawdown, ordersToday, openPositions, sector } = guardrails;

  return (
    <ModuleCard
      title="Guardrail headroom"
      subtitle="Live state vs the charter's hard rails"
      href="/strategy"
      hrefLabel="Charter"
    >
      <div className="flex flex-col gap-4">
        <Rail
          label="Drawdown vs halt"
          value={`−${(drawdown.used * 100).toFixed(1)}% / −${(
            drawdown.limit * 100
          ).toFixed(0)}%`}
          headroom={
            drawdown.breached
              ? "Halt threshold reached"
              : `${((drawdown.limit - drawdown.used) * 100).toFixed(
                  1,
                )}pp before new risk halts`
          }
          fraction={drawdown.fraction}
          danger={drawdown.breached}
        />
        <Rail
          label="Orders today"
          value={`${ordersToday.used} / ${ordersToday.limit}`}
          headroom={`${Math.max(
            0,
            ordersToday.limit - ordersToday.used,
          )} more allowed today`}
          fraction={ordersToday.fraction}
          danger={ordersToday.used >= ordersToday.limit}
        />
        <Rail
          label="Open positions"
          value={`${openPositions.used} / ${openPositions.limit}`}
          headroom={`${Math.max(
            0,
            openPositions.limit - openPositions.used,
          )} slots open`}
          fraction={openPositions.fraction}
          danger={openPositions.used >= openPositions.limit}
        />
        {sector ? (
          <Rail
            label={`Sector — ${sector.name}`}
            value={`${(sector.used * 100).toFixed(0)}% / ${(
              sector.limit * 100
            ).toFixed(0)}%`}
            headroom={
              sector.used >= sector.limit
                ? "Sector concentration cap reached"
                : `${((sector.limit - sector.used) * 100).toFixed(
                    0,
                  )}pp before the sector cap`
            }
            fraction={sector.fraction}
            danger={sector.used >= sector.limit}
          />
        ) : null}
      </div>
    </ModuleCard>
  );
}

function Rail({
  label,
  value,
  headroom,
  fraction,
  danger,
}: {
  label: string;
  value: string;
  headroom: string;
  fraction: number;
  danger: boolean;
}) {
  const atLimit = danger || fraction >= 1;
  const fill = atLimit ? "bg-loss" : "bg-fg-muted";
  const valueTone = atLimit ? "text-loss" : "text-fg";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg-muted">{label}</span>
        <span className={`text-sm font-medium tabular-nums ${valueTone}`}>
          {value}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-pill bg-surface-overlay"
      >
        <div
          className={`h-full rounded-pill ${fill}`}
          style={{ width: `${Math.max(2, fraction * 100)}%` }}
        />
      </div>
      <p className={`mt-1 text-xs ${atLimit ? "text-loss" : "text-fg-muted"}`}>
        {headroom}
      </p>
    </div>
  );
}
