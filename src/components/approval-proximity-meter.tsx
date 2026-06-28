import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  GaugeIcon,
  InfoIcon,
  LockIcon,
} from "@/components/icons";
import { redTeamVerdictStyle } from "@/lib/red-team-style";
import {
  deriveApprovalProximity,
  type ApprovalProximity,
  type ProximityInput,
  type ProximityVerdict,
} from "@/lib/proposal-proximity";

/**
 * Approval-proximity meter (approval-proximity-meter spec) — a brand-new,
 * **read-only** sidebar aid: at a glance, how close is the red-team to approval
 * vs. rejection? It is **additive** — the red-team block in the main column is
 * untouched; this is the quick read, that is the detail.
 *
 * **Honesty:** the value is a *derived interpretive reading* anchored to the
 * categorical verdict band (it can never disagree with the verdict), modulated
 * within-band by factor pressure + conviction + data completeness — NOT a
 * probability the model produced (see the italic subtitle + the pure
 * `deriveApprovalProximity`). Role tokens only (dark-mode safe); never
 * color-only (text labels + verdict pill + aria-label).
 *
 * **Lens-aware (proximity-meter-lens-aware M0).** It reads the
 * **currently-toggled lens** (its verdict, conviction, and value-quality data),
 * so a dual-lens analysis re-derives when the Trend/Value toggle flips. A
 * single-lens proposal passes its lone lens and reads identically to before.
 */

const SUBTITLE =
  "Interpretive reading of the red-team's categorical verdict, conviction, and data completeness — not a probability the model produced.";

/** Band → number text color (semantic status tokens, never the brand accent). */
const bandTextColor: Record<ProximityVerdict, string> = {
  reject: "text-danger",
  concern: "text-warning",
  approve: "text-success",
};

export function ApprovalProximityMeter({ lens }: { lens: ProximityInput }) {
  const p = deriveApprovalProximity(lens);

  // No red-team verdict yet → a calm placeholder, never a broken meter.
  if (p.verdict === null || p.value === null || p.band === null) {
    return (
      <div className="rounded-card border border-line bg-surface-raised p-4">
        <MeterHeader verdict={null} />
        <div className="mt-3 flex items-start gap-2 text-sm text-fg-muted">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p className="text-pretty">
            Awaiting the red-team verdict — the proximity reading appears once the
            proposal is judged.
          </p>
        </div>
      </div>
    );
  }

  const value = Math.round(p.value);
  const markerLeft = `${Math.min(100, Math.max(0, value))}%`;

  return (
    <div
      role="img"
      aria-label={`Approval proximity ${value} of 100 — ${p.band.label}; red-team verdict ${p.verdict}. A derived interpretive reading, not a model probability.`}
      className="rounded-card border border-line bg-surface-raised p-4"
    >
      <MeterHeader verdict={p.verdict} />

      {/* Value row: serif numeral colored to the band + the band label. */}
      <div className="mt-3 flex items-baseline gap-3">
        <span
          className={`font-serif text-[2.5rem] font-semibold leading-none tabular-nums ${bandTextColor[p.verdict]}`}
        >
          {value}
        </span>
        <span className="text-sm font-medium text-fg-muted">{p.band.label}</span>
      </div>

      {/* Banded track — fixed red/amber/green zones (33 / 33 / 34) with markers. */}
      <div className="mt-4">
        <div className="relative">
          <div className="flex h-2.5 w-full overflow-hidden rounded-pill">
            <span className="bg-danger/80" style={{ flex: 33 }} aria-hidden />
            <span className="bg-warning/80" style={{ flex: 33 }} aria-hidden />
            <span className="bg-success/80" style={{ flex: 34 }} aria-hidden />
          </div>
          {/* Faint cap marker — "the number can't go higher; data is incomplete". */}
          {p.capped && p.capValue !== null ? (
            <span
              aria-hidden
              className="absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-fg/40"
              style={{ left: `${p.capValue}%` }}
            />
          ) : null}
          {/* Value marker. */}
          <span
            aria-hidden
            className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-fg ring-2 ring-surface-raised"
            style={{ left: markerLeft }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[0.65rem] font-medium uppercase tracking-wide text-fg-muted">
          <span>Reject</span>
          <span>Concern</span>
          <span>Approve</span>
        </div>
      </div>

      {/* Data-completeness lock chip (the honesty cue). */}
      {p.capped && p.capReason ? (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-warning-border bg-warning-surface px-2.5 py-1 text-xs font-medium text-warning">
            <LockIcon className="size-3.5" />
            capped — {p.capReason}
          </span>
        </div>
      ) : null}

      {/* "What's moving it" chips. */}
      {p.drivers.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-fg-muted">
            What&apos;s moving it
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {p.drivers.map((d, i) => (
              <li key={i}>
                <DriverChip direction={d.direction}>{d.label}</DriverChip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-pretty text-[0.7rem] italic leading-snug text-fg-muted">
        {SUBTITLE}
      </p>
    </div>
  );
}

function MeterHeader({ verdict }: { verdict: ProximityVerdict | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[0.8rem] font-medium text-fg-muted">
        <GaugeIcon className="size-4" />
        Approval proximity
      </span>
      {verdict ? (
        <span
          className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-semibold ${redTeamVerdictStyle[verdict].className}`}
        >
          {redTeamVerdictStyle[verdict].label}
        </span>
      ) : null}
    </div>
  );
}

function DriverChip({
  direction,
  children,
}: {
  direction: ApprovalProximity["drivers"][number]["direction"];
  children: React.ReactNode;
}) {
  const up = direction === "up";
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  const cls = up
    ? "border-success-border bg-success-surface text-success"
    : "border-danger-border bg-danger-surface text-danger";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}
