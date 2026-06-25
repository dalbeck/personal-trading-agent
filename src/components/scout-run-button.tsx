"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerNewsScout } from "@/app/news/actions";
import { Button } from "@/components/ui/button";

/**
 * "Run scout" — scan public RSS now and tag headlines material to the tracked
 * universe (holdings + watchlist). Read-only w.r.t. trading; populates News.
 */
export function ScoutRunButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function run() {
    setNote(null);
    startTransition(async () => {
      const res = await triggerNewsScout();
      if (!res.ok) {
        setNote(res.error ?? "Scout failed.");
        return;
      }
      setNote(
        res.added && res.added > 0
          ? `Found ${res.added} new headline${res.added === 1 ? "" : "s"}.`
          : res.book === 0
            ? "Nothing tracked yet — add a holding or watchlist symbol."
            : "No new material headlines this scan.",
      );
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
      <Button variant="secondary" size="sm" disabled={pending} onClick={run}>
        {pending ? "Scanning…" : "Run scout"}
      </Button>
    </span>
  );
}
