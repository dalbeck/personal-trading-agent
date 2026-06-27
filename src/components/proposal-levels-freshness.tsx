"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  computePriceDrift,
  driftLabel,
  isStaleEntry,
} from "@/lib/price-freshness";

/**
 * Levels-freshness indicator on a proposal (fresh-entry-levels M1). A proposal's
 * entry/stop/target/sizing are anchored to the Alpaca quote at analysis; if the
 * price drifts, those levels go wrong. This shows **"levels as of … · price now
 * $X"**, flags when the entry has drifted stale, and offers a **Refresh levels**
 * re-anchor that recomputes every level off the current quote.
 *
 * The current quote is read client-side from the read-only quote endpoint (no
 * metered spend); the staleness math is the shared pure `price-freshness` module
 * so the indicator and the approval guard agree on "stale".
 */
export function ProposalLevelsFreshness({
  proposalId,
  symbol,
  entry,
  pricedAt,
  createdAt,
}: {
  proposalId: string;
  symbol: string;
  /** The anchored entry (the active lens's limit price). */
  entry: number;
  /** When the levels were priced; falls back to createdAt for older records. */
  pricedAt: string | null;
  createdAt: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadQuote = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/symbol/${encodeURIComponent(symbol)}/quote`,
        { method: "GET" },
      );
      const data = (await res.json()) as { price?: number | null };
      return typeof data?.price === "number" ? data.price : null;
    } catch {
      return null;
    }
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await loadQuote();
      if (cancelled) return;
      setQuote(p);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQuote]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/proposals/${encodeURIComponent(proposalId)}/refresh-levels`,
          { method: "POST" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error ?? "Couldn't refresh levels.");
          return;
        }
        // Re-read the server-rendered proposal (new levels + pricedAt).
        router.refresh();
        const p = await loadQuote();
        setQuote(p);
      } finally {
        setRefreshing(false);
        inFlight.current = false;
      }
    })();
  }, [proposalId, loadQuote, router]);

  const asOf = pricedAt ?? createdAt;
  const stale = quote !== null && isStaleEntry(entry, quote);
  const drift = quote !== null ? computePriceDrift(entry, quote) : null;

  return (
    <div className="flex flex-col gap-2 rounded-input border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <span>
          Levels as of{" "}
          <time dateTime={asOf} className="text-fg">
            {formatDateTime(asOf)}
          </time>
        </span>
        <span aria-hidden className="text-fg-muted/40">
          ·
        </span>
        <span>
          price now{" "}
          <span className="tabular-nums text-fg">
            {quote === null ? (loaded ? "—" : "…") : formatCurrency(quote)}
          </span>
        </span>
        {drift !== null && drift !== 0 ? (
          <span
            className={`tabular-nums ${stale ? "text-warning" : "text-fg-muted"}`}
          >
            ({driftLabel(entry, quote!)})
          </span>
        ) : null}
        {stale ? (
          <span className="inline-flex items-center rounded-pill border border-warning/40 bg-warning-surface px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-warning">
            Stale — refresh
          </span>
        ) : null}
      </div>

      {stale ? (
        <p className="text-pretty text-xs text-warning">
          The entry has moved from the live quote — the stop, reward/risk, and
          sizing are computed off a price the market has left. Refresh before
          approving.
        </p>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div>
        <Button
          variant={stale ? "primary" : "secondary"}
          size="sm"
          disabled={refreshing}
          onClick={refresh}
        >
          {refreshing ? "Refreshing levels…" : "Refresh levels"}
        </Button>
      </div>
    </div>
  );
}
