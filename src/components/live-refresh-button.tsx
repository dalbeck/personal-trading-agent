"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { snapshotFreshness } from "@/lib/snapshot-freshness";

/**
 * Refresh the live Robinhood snapshot on demand. The page renders from the last
 * saved snapshot (instant); this button triggers the slow read-only CLI read +
 * Alpaca price enrichment server-side, then refreshes the view. Read-only — it
 * can never place an order.
 *
 * The read takes tens of seconds (a `claude` CLI spawn), so the button shows a
 * busy state and is disabled while it runs.
 *
 * It also surfaces **freshness**: when the persisted snapshot is older than the
 * stale threshold (a scheduled refresh was missed/failed) the stamp turns into a
 * `· stale` warning. Staleness is computed client-side (it depends on "now") so
 * there is no hydration mismatch, and re-checked each minute.
 */
export function LiveRefreshButton({ asOf }: { asOf?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = () => setStale(snapshotFreshness(asOf, new Date()).stale);
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [asOf]);

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
        <span
          title={
            stale
              ? "The live snapshot is stale — the scheduled refresh may have failed. Click Refresh to pull now."
              : undefined
          }
          className={`text-xs tabular-nums ${
            stale ? "font-medium text-warning" : "text-fg-muted"
          }`}
        >
          as of {stamp}
          {stale ? " · stale" : ""}
        </span>
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
