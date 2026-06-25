import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/page-shell";

/**
 * Card wrapper for an Overview module: a titled header with an optional
 * "view all" link, then the module body. Keeps the six modules visually
 * consistent without repeating the header markup.
 */
export function ModuleCard({
  title,
  subtitle,
  href,
  hrefLabel,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            {hrefLabel ?? "View all"}{" "}
            <span aria-hidden>&rarr;</span>
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/** Calm, non-alarming empty state used inside a module when there's no data. */
export function ModuleEmpty({
  message,
  cta,
}: {
  message: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line bg-surface p-4">
      <p className="text-pretty text-sm text-fg-muted">{message}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="text-xs font-medium text-fg transition-colors hover:text-link"
        >
          {cta.label} <span aria-hidden>&rarr;</span>
        </Link>
      ) : null}
    </div>
  );
}
