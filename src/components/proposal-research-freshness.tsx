"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isResearchStale,
  researchAgeLabel,
} from "@/lib/research-display";

/**
 * Research freshness + rebuild control on a proposal (proposal-refresh-rebuilds
 * M3). Shows when the proposal's value-lens research (cashFlow / dividend /
 * catalyst / conviction / red-team) was last derived (`researchAt`) and flags it
 * stale past the soft age.
 *
 * For an analyze-a-symbol proposal (`rebuildable`), "Refresh research" RE-DERIVES
 * those fields from a fresh research fetch and overwrites the proposal in place
 * (a deliberate metered re-spend; the daily cap still gates it), then re-renders
 * so the page shows the rebuilt values — it no longer just bumps the symbol cache
 * while leaving the stored snapshot stale. For other proposals it falls back to
 * refreshing the symbol's research cache (the proposal itself isn't rebuilt).
 */
export function ProposalResearchFreshness({
  symbol,
  proposalId,
  researchAt,
  rebuildable = false,
}: {
  symbol: string;
  proposalId: string;
  /** When the proposal's research was last derived (falls back to createdAt). */
  researchAt: string | null;
  /** True for manual-request proposals that can be rebuilt from research. */
  rebuildable?: boolean;
}) {
  const router = useRouter();
  const [at, setAt] = useState<string | null>(researchAt);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    (async () => {
      try {
        if (rebuildable) {
          const res = await fetch(
            `/api/proposals/${encodeURIComponent(proposalId)}/refresh-research`,
            { method: "POST" },
          );
          const data = (await res.json()) as {
            researchAt?: string;
            error?: string;
          };
          if (!res.ok) {
            setError(data?.error ?? "Refresh failed.");
            return;
          }
          if (typeof data.researchAt === "string") setAt(data.researchAt);
          // Re-render the server component so the rebuilt cashFlow / dividend /
          // catalyst / conviction / red-team replace the stale stored snapshot.
          router.refresh();
        } else {
          // Non-rebuildable: refresh the symbol's research cache only.
          await fetch(
            `/api/symbol/${encodeURIComponent(symbol)}/research/refresh`,
            { method: "POST" },
          );
        }
      } catch {
        setError("Refresh failed.");
      } finally {
        setRefreshing(false);
      }
    })();
  }, [refreshing, rebuildable, proposalId, symbol, router]);

  const age = researchAgeLabel(at);
  const stale = isResearchStale(at);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <span>
        Research:{" "}
        {refreshing ? (
          <span>{rebuildable ? "rebuilding…" : "refreshing…"}</span>
        ) : age ? (
          <span className={stale ? "font-medium text-warning" : undefined}>
            {age}
            {stale ? " · stale — refresh" : ""}
          </span>
        ) : (
          <span>not derived</span>
        )}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        title={
          rebuildable
            ? "Re-run the analysis from fresh research (uses a metered call) and rebuild this proposal"
            : "Re-fetch this symbol's research (uses a metered call)"
        }
        className="rounded-pill border border-line bg-surface-overlay px-2 py-0.5 font-medium text-fg transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        {rebuildable ? "Refresh research" : "Refresh"}
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </span>
  );
}
