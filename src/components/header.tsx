import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Top bar. Surfaces the active trading environment. PAPER is live this phase
 * (accent-outlined); LIVE is stubbed and must read as clearly off/disconnected
 * — paper vs. live must always be visually distinct (.agents/nextjs.md safety).
 */
export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-accent px-2.5 py-1 text-xs font-semibold text-fg">
          <span aria-hidden className="size-1.5 rounded-pill bg-accent" />
          PAPER
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-fg-muted">
          <span aria-hidden className="size-1.5 rounded-pill bg-fg-muted/50" />
          LIVE · not connected
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
