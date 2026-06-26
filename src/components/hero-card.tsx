import type { ComponentType, ReactNode, SVGProps } from "react";
import { splitNumberParts, type Tone } from "@/lib/format";
import { DeltaPill } from "@/components/overview/kpi-card";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const numberTone: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-fg",
};

/**
 * The one focal "hero" surface per page (.agents/design-system.md "tone"): a
 * subtle accent gradient + glow with a faint dot-grid texture, masked so it
 * fades. Use sparingly — the page's anchor, not every card. Pure presentation;
 * the gradient/glow live in the `surface-hero` / `bg-dot-grid` utilities.
 */
export function HeroCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`surface-hero relative overflow-hidden rounded-card border border-line p-6 md:p-7 ${className}`}
    >
      <div
        aria-hidden
        className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(120%_100%_at_85%_0%,black,transparent_62%)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * The hero's primary figure: a muted label + a large two-tone number (cents
 * de-emphasized) + an optional delta pill and trailing slot (e.g. a sparkline).
 * Numbers stay sans `tabular-nums` — serif never touches data.
 */
export function HeroMetric({
  label,
  value,
  tone = "neutral",
  delta,
  deltaTone,
  aside,
}: {
  label: string;
  value: string;
  tone?: Tone;
  delta?: string;
  deltaTone?: Tone;
  aside?: ReactNode;
}) {
  const { primary, secondary } = splitNumberParts(value);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="text-[2.5rem] font-semibold leading-none tabular-nums md:text-[2.75rem]">
          <span className={numberTone[tone]}>{primary}</span>
          {secondary ? <span className="text-fg-subtle">{secondary}</span> : null}
        </p>
        {aside}
      </div>
      {delta ? <DeltaPill value={delta} tone={deltaTone ?? tone} /> : null}
    </div>
  );
}

/**
 * A flat secondary stat that rides on the hero surface — deliberately lower
 * chrome than a KpiCard so the rhythm reads hero ↔ supporting, not a uniform
 * grid. Optional tinted icon when a stat earns one.
 */
export function HeroStat({
  label,
  value,
  tone = "neutral",
  delta,
  deltaTone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: Tone;
  delta?: string;
  deltaTone?: Tone;
  icon?: IconType;
}) {
  const { primary, secondary } = splitNumberParts(value);
  return (
    <div className="flex flex-col gap-1.5 rounded-input border border-line/70 bg-surface/40 p-3">
      <span className="flex items-center gap-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-fg-muted">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-lg font-semibold leading-none tabular-nums">
          <span className={numberTone[tone]}>{primary}</span>
          {secondary ? (
            <span className="text-fg-subtle">{secondary}</span>
          ) : null}
        </p>
        {delta ? (
          <span
            className={`text-xs font-medium tabular-nums ${numberTone[deltaTone ?? tone]}`}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
