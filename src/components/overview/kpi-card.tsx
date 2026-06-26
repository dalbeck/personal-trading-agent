import type { ComponentType, SVGProps } from "react";
import { Card } from "@/components/page-shell";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@/components/icons";
import { splitNumberParts, type Tone } from "@/lib/format";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const numberTone: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-fg",
};

const iconTint: Record<Tone, string> = {
  gain: "bg-gain/12 text-gain",
  loss: "bg-loss/12 text-loss",
  neutral: "bg-accent/12 text-accent",
};

/**
 * Enriched KPI tile (.agents/design-system.md "Enriched KPI card"): a small
 * tinted rounded-square icon + muted label, a big **two-tone** number (cents
 * de-emphasized in text-fg-subtle), an optional gain/loss delta pill, and an
 * optional sparkline. Calm by default — `tone` only colors the figure where it
 * carries P&L meaning; structural KPIs stay neutral with a blue-tinted icon.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  delta,
  deltaTone,
  sparkline,
}: {
  label: string;
  value: string;
  icon: IconType;
  tone?: Tone;
  /** Formatted delta string (e.g. a percent) shown in a tinted pill. */
  delta?: string;
  deltaTone?: Tone;
  /** Optional series for a trailing sparkline (e.g. the equity curve). */
  sparkline?: number[];
}) {
  const { primary, secondary } = splitNumberParts(value);
  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-[12px] ${iconTint[tone]}`}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {label}
          </span>
        </div>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline values={sparkline} tone={tone} />
        ) : null}
      </div>

      <p className="text-[1.75rem] font-semibold leading-none tabular-nums">
        <span className={numberTone[tone]}>{primary}</span>
        {secondary ? (
          <span className="text-fg-subtle">{secondary}</span>
        ) : null}
      </p>

      {delta ? <DeltaPill value={delta} tone={deltaTone ?? tone} /> : null}
    </Card>
  );
}

/** Compact tinted pill carrying a signed delta with a directional arrow. */
export function DeltaPill({ value, tone }: { value: string; tone: Tone }) {
  const cls =
    tone === "gain"
      ? "bg-gain/12 text-gain"
      : tone === "loss"
        ? "bg-loss/12 text-loss"
        : "bg-fg-muted/10 text-fg-muted";
  const Arrow =
    tone === "gain"
      ? ArrowUpRightIcon
      : tone === "loss"
        ? ArrowDownRightIcon
        : null;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      {Arrow ? <Arrow className="size-3.5" aria-hidden /> : null}
      {value}
    </span>
  );
}

const SW = 72;
const SH = 28;
const SPAD = 2;

/** Minimal trailing sparkline. Pure SVG, stroke inherits the tone color. */
function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = SPAD + (i / (n - 1)) * (SW - 2 * SPAD);
    const y = SH - SPAD - ((v - min) / span) * (SH - 2 * SPAD);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${pts.join(" L")}`;
  const stroke =
    tone === "gain"
      ? "stroke-gain"
      : tone === "loss"
        ? "stroke-loss"
        : "stroke-accent";
  return (
    <svg
      viewBox={`0 0 ${SW} ${SH}`}
      className={`h-7 w-[72px] shrink-0 ${stroke}`}
      fill="none"
      aria-hidden
    >
      <path
        d={line}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
