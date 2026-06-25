"use client";

import { formatCurrency } from "@/lib/format";
import {
  perplexityNote,
  useSymbolResearch,
} from "@/components/symbol/research-context";

/**
 * Analyst-consensus block — **Perplexity** (`finance_search`) only (Robinhood
 * does not provide price targets). Rating chip plus the low / mean / high price
 * targets and the contributing analyst count. Shows "—" until the auto-loaded
 * research resolves, or a short note when Perplexity is off / capped. Context
 * only — not a recommendation.
 */

function Target({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-fg">
        {value === null ? "—" : formatCurrency(value)}
      </dd>
    </div>
  );
}

export function AnalystConsensus() {
  const state = useSymbolResearch();
  const loading = state.status === "loading";
  const research = state.status === "loaded" ? state.research : null;
  const c = research?.consensus ?? null;
  const note =
    research && !c ? perplexityNote(research.perplexity) : null;

  return (
    <section
      aria-labelledby="consensus-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consensus-heading" className="text-sm font-semibold text-fg">
          Analyst consensus
        </h2>
        {loading ? (
          <span
            className="inline-block h-5 w-20 animate-pulse rounded-pill bg-surface-overlay"
            aria-hidden
          />
        ) : c?.rating ? (
          <span className="rounded-pill border border-line bg-surface-overlay px-2.5 py-0.5 text-xs font-semibold text-fg">
            {c.rating}
          </span>
        ) : (
          <span className="text-sm text-fg-muted">—</span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
        <Target label="Target low" value={c?.targetLow ?? null} />
        <Target label="Target mean" value={c?.targetMean ?? null} />
        <Target label="Target high" value={c?.targetHigh ?? null} />
      </dl>

      <p className="mt-4 border-t border-line pt-3 text-xs text-fg-muted">
        {c?.analystCount != null
          ? `Based on ${c.analystCount} analyst${c.analystCount === 1 ? "" : "s"} · `
          : ""}
        <span className="font-medium">Perplexity</span> finance_search — context
        only, not a recommendation.
      </p>

      {note ? <p className="mt-2 text-xs text-fg-muted">{note}</p> : null}
    </section>
  );
}
