import { RiskPostureGauge } from "@/components/charts/risk-posture-gauge";
import { Term } from "@/components/term";
import type { PostureFactor, RiskPosture } from "@/lib/risk-posture";

/**
 * Risk-posture card (M6): the sleek gauge + a transparent factor breakdown + a
 * plain-language summary, on a subtle gradient surface with a serif title. The
 * gauge is honest by construction — a snapshot of current positioning, with a
 * glossary tooltip on the title explaining exactly what drives it.
 */
export function RiskPostureCard({
  posture,
  scopeLabel,
}: {
  posture: RiskPosture;
  scopeLabel?: string;
}) {
  return (
    <section className="surface-hero relative overflow-hidden rounded-card border border-line p-6">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
          <Term term="risk-posture">Risk posture</Term>
        </h2>
        {scopeLabel ? (
          <span className="text-xs text-fg-muted">{scopeLabel}</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-8">
        <RiskPostureGauge
          score={posture.score}
          level={posture.level}
          summary={posture.summary}
        />
        <div className="flex flex-col gap-4">
          <p className="text-pretty text-sm leading-relaxed text-fg">
            {posture.summary}
          </p>
          <FactorBars factors={posture.factors} />
          <p className="text-pretty text-xs text-fg-muted">
            A snapshot of current positioning — not a prediction or a safety
            rating.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Compact variant for other pages — the small gauge + the summary line. */
export function RiskPostureCompact({ posture }: { posture: RiskPosture }) {
  return (
    <div className="surface-hero flex items-center gap-4 rounded-card border border-line p-4">
      <RiskPostureGauge
        compact
        score={posture.score}
        level={posture.level}
        summary={posture.summary}
      />
      <div className="min-w-0">
        <h3 className="font-serif text-[0.95rem] font-semibold text-fg">
          <Term term="risk-posture">Risk posture</Term>
        </h3>
        <p className="mt-1 text-pretty text-sm text-fg-muted">
          {posture.summary}
        </p>
      </div>
    </div>
  );
}

/** Thin, quiet factor bars — the transparent breakdown behind the score. The
 *  fill is neutral so it never competes with the gauge's color ramp. */
function FactorBars({ factors }: { factors: PostureFactor[] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {factors.map((f) => (
        <div key={f.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-fg-muted">{f.label}</dt>
            <dd className="tabular-nums text-fg">{f.detail}</dd>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-line">
            <div
              className="h-full rounded-pill bg-fg-muted"
              style={{ width: `${Math.round(Math.max(0, Math.min(100, f.value)))}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}
