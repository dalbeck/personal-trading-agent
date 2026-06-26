export type ProgressTone = "accent" | "gain" | "warning" | "loss";

const fillTone: Record<ProgressTone, string> = {
  accent: "bg-accent",
  gain: "bg-gain",
  warning: "bg-warning",
  loss: "bg-loss",
};

/**
 * A labelled progress bar (design-system "Progress bars for every target"):
 * neutral track + accent/semantic fill + a value label and optional caption.
 * Used for the evaluation window, the live pilot caps, and guardrail headroom.
 */
export function ProgressBar({
  label,
  valueText,
  caption,
  value,
  max = 1,
  tone = "accent",
  className = "",
}: {
  label: string;
  valueText?: string;
  caption?: string;
  value: number;
  max?: number;
  tone?: ProgressTone;
  className?: string;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg-muted">{label}</span>
        {valueText ? (
          <span className="text-sm font-medium tabular-nums text-fg">
            {valueText}
          </span>
        ) : null}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(frac * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-2.5 w-full overflow-hidden rounded-pill bg-surface-overlay"
      >
        <div
          className={`h-full rounded-pill transition-[width] duration-200 ease-out ${fillTone[tone]}`}
          style={{ width: `${Math.max(2, frac * 100)}%` }}
        />
      </div>
      {caption ? <p className="mt-1.5 text-xs text-fg-muted">{caption}</p> : null}
    </div>
  );
}
