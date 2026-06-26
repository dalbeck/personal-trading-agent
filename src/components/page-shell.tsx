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
      <h1 className="text-balance font-serif text-[1.75rem] font-semibold leading-tight text-fg">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 text-pretty text-sm text-fg-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}

/**
 * A "chapter break" between major sections on dense pages (M4): a serif section
 * title (larger than a card title) + an optional note, with generous top space
 * so sections read as distinct chapters rather than one continuous stream.
 * Pair with big inter-section gaps — hierarchy + whitespace, not more chrome.
 */
export function SectionTitle({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  /** Optional right-aligned slot (e.g. a link or badge). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <h2 className="font-serif text-lg font-semibold text-fg">{title}</h2>
        {note ? (
          <p className="mt-1 max-w-2xl text-pretty text-sm text-fg-muted">
            {note}
          </p>
        ) : null}
      </div>
      {children}
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
