"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MODE_LABEL,
  VIEW_MODES,
  VIEW_MODE_COOKIE,
  type ViewMode,
} from "@/lib/mode";

// Module-scope (not a component/hook) so the DOM write is a plain side-effect
// helper, not a mutation inside render. A view preference only — never
// sensitive data. One year, lax.
function persistViewMode(next: ViewMode) {
  try {
    document.cookie = `${VIEW_MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* storage disabled — the refresh still re-reads any existing cookie */
  }
}

/**
 * Global Paper | Live **view** toggle. Picks which book the panels display —
 * it is a view switch, not an engine switch: both desks keep running and
 * switching to Live never arms trading (the order gate is independent; see the
 * separate LIVE TRADING chip).
 *
 * Persists the choice in a cookie the server reads on the next render, so the
 * correct book paints with no flash. `router.refresh()` re-renders the server
 * components against the new cookie value.
 */
export function ModeToggle({ mode }: { mode: ViewMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: ViewMode) {
    if (next === mode || pending) return;
    persistViewMode(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Account view mode"
      className={`inline-flex items-center gap-0.5 rounded-pill border border-line p-0.5 transition-opacity duration-150 ${
        pending ? "opacity-60" : ""
      }`}
    >
      {VIEW_MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => select(m)}
            aria-pressed={active}
            title={`View the ${MODE_LABEL[m].toLowerCase()} book`}
            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ease-out ${
              active
                ? "bg-surface-overlay text-fg shadow-sm"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-pill ${
                active ? "bg-accent" : "bg-fg-muted/40"
              }`}
            />
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}
