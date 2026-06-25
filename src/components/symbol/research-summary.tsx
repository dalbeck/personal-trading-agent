"use client";

import { Markdown } from "@/components/markdown";
import { formatDateTime } from "@/lib/format";
import type { SymbolResearch } from "@/lib/server/research/types";
import {
  perplexityNote,
  useSymbolResearch,
} from "@/components/symbol/research-context";

/**
 * Auto-loaded AI research summary (Perplexity `finance_search`). Loads on mount
 * within the daily cap (and the per-day cache). Prose + finance tables render
 * through the safe Markdown pipeline (the content is provider-generated). Off /
 * capped / unavailable degrade to a clear note pointing at the research
 * link-outs — never an error.
 */
export function SymbolResearchSummary() {
  const state = useSymbolResearch();
  const research = state.status === "loaded" ? state.research : null;
  const note = research ? perplexityNote(research.perplexity) : null;
  const hasBody =
    !!research &&
    (research.summary.length > 0 || research.finance.some((b) => b.content));

  return (
    <section
      aria-labelledby="ai-research-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <h2 id="ai-research-heading" className="text-sm font-semibold text-fg">
        AI research summary
      </h2>
      <p className="mt-0.5 text-xs text-fg-muted">
        Analyst views &amp; catalysts via Perplexity{" "}
        <span className="font-medium">finance_search</span> — metered &amp; capped,
        auto-loaded once per visit (cached for the day).
      </p>

      {state.status === "loading" ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <span className="h-4 w-full animate-pulse rounded bg-surface-overlay" />
          <span className="h-4 w-5/6 animate-pulse rounded bg-surface-overlay" />
          <span className="h-4 w-2/3 animate-pulse rounded bg-surface-overlay" />
        </div>
      ) : research && hasBody ? (
        <ResearchBody research={research} />
      ) : note ? (
        <p className="mt-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
          {note}
        </p>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">
          No AI summary was returned for this symbol.
        </p>
      )}
    </section>
  );
}

function ResearchBody({ research }: { research: SymbolResearch }) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {research.categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {research.categories.map((c) => (
            <span
              key={c}
              className="rounded-pill border border-line px-2 py-0.5 text-xs font-medium text-fg-muted"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {research.summary ? <Markdown source={research.summary} /> : null}

      {research.finance.map((block, i) =>
        block.content ? <Markdown key={i} source={block.content} /> : null,
      )}

      {research.sources.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Sources
          </p>
          <ul className="flex flex-col gap-1">
            {research.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-link underline-offset-2 hover:text-link-hover hover:underline"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-fg-muted">
        Source: Perplexity <span className="font-medium">finance_search</span>{" "}
        (metered){research.usedAt ? ` · retrieved ${formatDateTime(research.usedAt)}` : ""}
        {research.cost != null ? ` · $${research.cost.toFixed(4)}` : ""}
        {research.cached ? " · cached" : ""}. Context only — not a price or a
        recommendation.
      </p>
    </div>
  );
}
