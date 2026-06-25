"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresh the live Robinhood snapshot on demand. The page renders from the last
 * saved snapshot (instant); this button triggers the slow read-only CLI read +
 * Alpaca price enrichment server-side, then refreshes the view. Read-only — it
 * can never place an order.
 *
 * The read takes tens of seconds (a `claude` CLI spawn), so the button shows a
 * busy state and is disabled while it runs.
 */
export function LiveRefreshButton({ asOf }: { asOf?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await fetch("/api/live/refresh", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const stamp = asOf
    ? new Date(asOf).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <span className="inline-flex items-center gap-2">
      {stamp ? (
        <span className="text-xs tabular-nums text-fg-muted">as of {stamp}</span>
      ) : null}
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        aria-label="Refresh live account"
        className="rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors duration-150 ease-out hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </span>
  );
}
