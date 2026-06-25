"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Pull the human's manual live trades from Robinhood order history (read-only)
 * into the journal so Coaching can review them. The read takes tens of seconds
 * (a `claude` CLI spawn), so the button shows a busy state. Read-only — it can
 * never place an order; it only reads filled-order history and writes journal
 * entries.
 */
export function SyncLiveTradesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/live/sync-trades", { method: "POST" });
      const data = (await res.json()) as {
        connected: boolean;
        ingested: number;
      };
      setNote(
        !data.connected
          ? "Not connected — connect the Agentic account first."
          : data.ingested > 0
            ? `Saved ${data.ingested} trade${data.ingested === 1 ? "" : "s"} to the Journal — run Weekly review to coach ${data.ingested === 1 ? "it" : "them"}.`
            : "No new trades to ingest (already up to date).",
      );
      router.refresh();
    } catch {
      setNote("Sync failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        aria-label="Sync manual live trades from Robinhood"
        className="rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors duration-150 ease-out hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Syncing…" : "Sync live trades"}
      </button>
    </span>
  );
}
