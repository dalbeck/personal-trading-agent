import type { RedTeamVerdict } from "@/lib/types";
import { Term } from "@/components/term";
import { factorStanceStyle, redTeamVerdictStyle } from "@/lib/red-team-style";

/**
 * The red-team's structured rationale, rendered roomily and shared by the
 * proposal card and the approve dialog. A **semantic** verdict badge (approve →
 * success, concern → warning, reject → danger), a one-line "basis" (how it
 * decided), the primary objection, and the keyed factor assessments — each
 * factor stance-coloured. Degrades gracefully for older verdicts that carry only
 * `notes` (no factors / basis).
 */
export function RedTeamVerdict({
  verdict,
  className = "",
}: {
  verdict: RedTeamVerdict;
  className?: string;
}) {
  const style = redTeamVerdictStyle[verdict.verdict];

  return (
    <section
      aria-label="Codex red-team verdict"
      className={`rounded-card border border-l-4 p-4 ${style.callout} ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Codex <Term term="red-team">red-team</Term>
        </h3>
        <span
          className={`rounded-pill border px-2.5 py-0.5 text-xs font-semibold ${style.className}`}
        >
          {style.label}
        </span>
      </div>

      {verdict.basis ? (
        <p className="mt-2.5 text-pretty text-sm font-medium text-fg">
          {verdict.basis}
        </p>
      ) : null}

      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-fg-muted">
        {verdict.notes}
      </p>

      {verdict.factors.length > 0 ? (
        <dl className="mt-3.5 grid gap-x-6 gap-y-3 border-t border-line pt-3.5 sm:grid-cols-2">
          {verdict.factors.map((f, i) => {
            const stance = factorStanceStyle[f.stance];
            return (
              <div key={`${f.label}-${i}`} className="flex flex-col gap-1">
                <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-pill ${stance.dot}`}
                  />
                  {f.label}
                  <span className="sr-only"> — {stance.label}</span>
                </dt>
                <dd className="text-pretty text-sm leading-relaxed text-fg">
                  {f.assessment}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </section>
  );
}
