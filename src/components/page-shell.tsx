import type { ReactNode } from "react";

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-fg">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 text-pretty text-sm text-fg-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** Bordered card surface used across views. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface-raised p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** Single labelled figure (equity, P&L, …). Numbers use tabular-nums. */
export function StatCard({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const toneClass =
    tone === "gain"
      ? "text-gain"
      : tone === "loss"
        ? "text-loss"
        : "text-fg";
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {delta ? (
        <p className={`mt-1 text-sm tabular-nums ${toneClass}`}>{delta}</p>
      ) : null}
    </Card>
  );
}

/** Placeholder body for routes whose real views ship in later milestones. */
export function Placeholder({ note }: { note: string }) {
  return (
    <Card className="border-dashed">
      <p className="text-sm text-fg-muted">{note}</p>
    </Card>
  );
}
