import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "gain" | "loss" | "muted";

const tones: Record<BadgeTone, string> = {
  neutral: "border border-line text-fg",
  accent: "border border-accent text-fg",
  gain: "border border-gain/40 text-gain",
  loss: "border border-loss/40 text-loss",
  muted: "border border-line text-fg-muted",
};

// Filled (tinted) variant — a calmer, more confident pill for primary status
// markers like BUY/SELL. Tint only; no border.
const solidTones: Record<BadgeTone, string> = {
  neutral: "bg-fg/5 text-fg",
  accent: "bg-accent/15 text-accent",
  gain: "bg-gain/12 text-gain",
  loss: "bg-loss/12 text-loss",
  muted: "bg-fg-muted/10 text-fg-muted",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  solid = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  solid?: boolean;
}) {
  const dotColor =
    tone === "accent"
      ? "bg-accent"
      : tone === "gain"
        ? "bg-gain"
        : tone === "loss"
          ? "bg-loss"
          : "bg-fg-muted/50";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ${
        solid ? solidTones[tone] : tones[tone]
      }`}
    >
      {dot ? (
        <span aria-hidden className={`size-1.5 rounded-pill ${dotColor}`} />
      ) : null}
      {children}
    </span>
  );
}
