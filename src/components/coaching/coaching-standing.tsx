import { HeroCard } from "@/components/hero-card";
import type { CoachingEntry } from "@/lib/types";

type Grade = CoachingEntry["grade"];

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

// Grade → bar/figure color. A/B = gain, C = neutral, D/F = loss (grades are not
// signed, so this is a flat per-grade tint, never DivergingBars).
const gradeColor: Record<Grade, { bar: string; text: string }> = {
  A: { bar: "bg-gain", text: "text-gain" },
  B: { bar: "bg-gain", text: "text-gain" },
  C: { bar: "bg-fg-muted", text: "text-fg-muted" },
  D: { bar: "bg-loss", text: "text-loss" },
  F: { bar: "bg-loss", text: "text-loss" },
};

/**
 * The page's one focal surface: coaching standing. A presentation-only
 * aggregation of the scoped entries into a grade distribution (count per
 * A/B/C/D/F) visualized as a small horizontal bar set, plus headline totals
 * (entries logged, daily vs weekly split, promoted-to-playbook). Serif display
 * numbers carry the headline voice. Derives counts from `entries` — no data or
 * logic changes. a11y: the bar set has an sr-only text equivalent.
 */
export function CoachingStanding({ entries }: { entries: CoachingEntry[] }) {
  const total = entries.length;
  const counts = GRADES.reduce(
    (acc, g) => {
      acc[g] = 0;
      return acc;
    },
    {} as Record<Grade, number>,
  );
  let daily = 0;
  let weekly = 0;
  let promoted = 0;
  for (const e of entries) {
    counts[e.grade] += 1;
    if (e.period === "daily") daily += 1;
    else weekly += 1;
    if (e.promotedToPlaybook) promoted += 1;
  }
  const peak = Math.max(1, ...GRADES.map((g) => counts[g]));

  const distributionText = GRADES.map((g) => `${counts[g]} ${g}`).join(", ");

  return (
    <HeroCard surface="surface-hero-accent">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Coaching standing
            </span>
            <div className="flex items-end gap-3">
              <p className="font-serif text-[2.5rem] font-semibold leading-none tabular-nums text-fg md:text-[2.75rem]">
                {total}
              </p>
              <p className="pb-1 text-sm text-fg-muted">
                {total === 1 ? "review logged" : "reviews logged"}
              </p>
            </div>
          </div>

          {/* Headline split — flat supporting stats on the hero surface */}
          <dl className="flex flex-wrap gap-2.5">
            <SummaryStat label="Daily" value={daily} />
            <SummaryStat label="Weekly" value={weekly} />
            <SummaryStat label="Promoted" value={promoted} />
          </dl>
        </div>

        {/* Grade distribution — a small horizontal bar set (grades unsigned) */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-sm font-semibold text-fg">
              Grade distribution
            </h3>
            <span className="text-xs text-fg-muted">across {total}</span>
          </div>
          <div
            role="img"
            aria-label={`Grade distribution across ${total} ${
              total === 1 ? "review" : "reviews"
            }: ${distributionText}.`}
            className="flex flex-col gap-2"
          >
            {GRADES.map((g) => {
              const count = counts[g];
              const pct = (count / peak) * 100;
              return (
                <div key={g} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`w-5 shrink-0 font-serif text-sm font-semibold ${gradeColor[g].text}`}
                  >
                    {g}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface/50">
                    <div
                      className={`h-full rounded-pill ${gradeColor[g].bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span
                    aria-hidden
                    className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-fg"
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </HeroCard>
  );
}

/** A flat supporting stat on the hero surface (serif figure + muted label). */
function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-input border border-line/70 bg-surface/40 px-3.5 py-2.5">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="font-serif text-lg font-semibold leading-none tabular-nums text-fg">
        {value}
      </dd>
    </div>
  );
}
