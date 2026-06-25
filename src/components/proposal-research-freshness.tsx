"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isResearchStale,
  researchAgeLabel,
} from "@/lib/research-display";

/**
 * Linked-symbol research freshness on a proposal card. Reads the **cache only**
 * on mount (the `research/freshness` GET never fetches), so rendering the
 * proposals queue costs nothing. The Refresh action force-fetches (a deliberate
 * metered spend) through the same route the symbol page uses, then re-reads the
 * freshness. Shows how stale the research backing this idea is, right where the
 * trade is approved.
 */
export function ProposalResearchFreshness({ symbol }: { symbol: string }) {
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const loadFreshness = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/symbol/${encodeURIComponent(symbol)}/research/freshness`,
        { method: "GET" },
      );
      const data = (await res.json()) as { fetchedAt?: string | null };
      return typeof data?.fetchedAt === "string" ? data.fetchedAt : null;
    } catch {
      return null;
    }
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const at = await loadFreshness();
      if (cancelled) return;
      setFetchedAt(at);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFreshness]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/symbol/${encodeURIComponent(symbol)}/research/refresh`,
          { method: "POST" },
        );
        const data = (await res.json()) as { fetchedAt?: string | null };
        if (typeof data?.fetchedAt === "string") setFetchedAt(data.fetchedAt);
      } catch {
        /* keep the prior freshness on failure */
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    })();
  }, [symbol]);

  if (!loaded) return null; // nothing until the cache read resolves

  const age = researchAgeLabel(fetchedAt);
  const stale = isResearchStale(fetchedAt);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span>
        Research:{" "}
        {refreshing ? (
          <span>refreshing…</span>
        ) : age ? (
          <span className={stale ? "font-medium text-warning" : undefined}>
            {age}
            {stale ? " · stale" : ""}
          </span>
        ) : (
          <span>not cached</span>
        )}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        title="Re-fetch this symbol's research (uses a metered call)"
        className="rounded-pill border border-line bg-surface-overlay px-2 py-0.5 font-medium text-fg transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        {age ? "Refresh" : "Fetch"}
      </button>
    </span>
  );
}
