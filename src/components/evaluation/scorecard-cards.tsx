import type { ComponentType, SVGProps } from "react";
import {
  CheckIcon,
  FlagIcon,
  GoLiveIcon,
  InfoIcon,
  XIcon,
} from "@/components/icons";
import { ProgressBar } from "@/components/ui/progress";
import { verdictStyle } from "@/lib/eval/verdict-style";
import { MIN_WINDOW_POINTS } from "@/lib/eval/scorecard";
import type { Scorecard, VerdictKind } from "@/lib/eval/scorecard";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Per-verdict glyph for the focal hero — purely presentational, paired with the
 * shared `verdictStyle` semantic tints (success / warning / danger / neutral).
 * Never the brand accent (verdict is status, not an action).
 */
const verdictIcon: Record<VerdictKind, IconType> = {
  "go-candidate": GoLiveIcon,
  iterate: FlagIcon,
  "no-go": XIcon,
  incomplete: InfoIcon,
};

/**
 * The focal go/no-go verdict surface for the paper scorecard. A verdict-tinted
 * card (semantic success/warning/danger via the shared `verdictStyle`, NOT the
 * brand accent) carrying the verdict as a large serif headline, its reasons,
 * the advisory caveat, and the evaluation-window progress prominently inside —
 * the one dominant element on the page. Pure presentation: it renders the
 * already-computed `verdict` + `window`; it changes no value or gate semantics.
 */
export function VerdictHero({
  verdict,
  window,
}: {
  verdict: Scorecard["verdict"];
  window: Scorecard["window"];
}) {
  const style = verdictStyle[verdict.kind];
  const Icon = verdictIcon[verdict.kind];
  const full = window.points >= MIN_WINDOW_POINTS;
  // Mirror the window section's tone choice so nothing about the gate changes.
  const windowTone = full ? "gain" : "accent";

  return (
    <div className={`rounded-card border p-6 md:p-7 ${style.className}`}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <span className="text-xs font-medium uppercase tracking-wide opacity-80">
            Advisory verdict
          </span>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-fg/5"
            >
              <Icon className="size-6" />
            </span>
            <h2 className="text-balance font-serif text-[2rem] font-semibold leading-none md:text-[2.25rem]">
              {style.label}
            </h2>
          </div>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-fg">
            {verdict.reasons.map((r, i) => (
              <li key={i} className="text-pretty">
                {r}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">
            Advisory only — the final GO to a capped live pilot is a human
            decision, and the qualitative criteria (section 5) are not
            auto-scored.
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface-raised p-5">
          <ProgressBar
            label="Evaluation window"
            valueText={`${window.points} / ${MIN_WINDOW_POINTS} sessions`}
            value={window.points}
            max={MIN_WINDOW_POINTS}
            tone={windowTone}
            caption={
              full
                ? "Full evaluation window reached."
                : `${Math.max(0, MIN_WINDOW_POINTS - window.points)} more equity points to a full ${MIN_WINDOW_POINTS}-session window.`
            }
          />
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <WindowFact label="Start" value={window.startDate} />
            <WindowFact label="End" value={window.endDate} />
            <WindowFact label="Equity points" value={String(window.points)} />
            <WindowFact
              label="Equity"
              value={
                window.startingEquity === null || window.endingEquity === null
                  ? null
                  : `${window.startingEquity.toLocaleString()} → ${window.endingEquity.toLocaleString()}`
              }
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

const DASH = "—";

function WindowFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="font-medium tabular-nums text-fg">{value ?? DASH}</dd>
    </div>
  );
}

/**
 * A single process-integrity check rendered as a chip: green CheckIcon when the
 * check is clean, a warning-toned FlagIcon (or XIcon for a hard fail) otherwise.
 * Every check stays legible — these are safety checks, so a failure must read
 * loudly, never collapse to a subtle dot.
 */
export function IntegrityChip({
  ok,
  hardFail = false,
  children,
}: {
  ok: boolean;
  /** When not ok, render the louder XIcon (hard veto) instead of a flag. */
  hardFail?: boolean;
  children: React.ReactNode;
}) {
  const Icon = ok ? CheckIcon : hardFail ? XIcon : FlagIcon;
  const cls = ok
    ? "border-success-border bg-success-surface text-success"
    : "border-danger-border bg-danger-surface text-danger";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium ${cls}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Small stat tile for the reliability strip — a labelled count with an optional
 * semantic tone (errors → loss). Flatter than a KpiCard so the strip reads as a
 * supporting row, not a focal grid. Pure presentation.
 */
export function ReliabilityTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-fg";
  return (
    <div className="rounded-card border border-line bg-surface-raised p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className={`mt-2 font-serif text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
