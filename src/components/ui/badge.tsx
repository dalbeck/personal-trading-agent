import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "gain" | "loss" | "muted";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line text-fg",
  accent: "border-accent text-fg",
  gain: "border-gain/40 text-gain",
  loss: "border-loss/40 text-loss",
  muted: "border-line text-fg-muted",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
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
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {dot ? (
        <span aria-hidden className={`size-1.5 rounded-pill ${dotColor}`} />
      ) : null}
      {children}
    </span>
  );
}
