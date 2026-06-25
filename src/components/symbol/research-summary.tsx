"use client";

import { Markdown } from "@/components/markdown";
import { formatDateTime } from "@/lib/format";
import type { ResearchResult } from "@/lib/server/research/types";
import {
  researchNote,
  useSymbolResearch,
} from "@/components/symbol/research-context";

/**
 * Auto-loaded AI research summary (Perplexity `finance_search`). Replaces the
 * old click-to-load button: the symbol page loads it on mount within the daily
 * cap. Prose + finance tables render through the safe Markdown pipeline (the
 * content is provider-generated). Off / capped / unavailable degrade to a clear
 * note pointing at the research link-outs — never an error.
 */
export function SymbolResearchSummary() {
  const research = useSymbolResearch();
  const note = researchNote(research);

  return (
    <section
      aria-labelledby="ai-research-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <h2 id="ai-research-heading" className="text-sm font-semibold text-fg">
        AI research summary
      </h2>
      <p className="mt-0.5 text-xs text-fg-muted">
        Fundamentals, earnings, analyst views &amp; catalysts via Perplexity{" "}
        <span className="font-medium">finance_search</span> — metered &amp; capped,
        auto-loaded once per visit.
      </p>

      {research.status === "loading" ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <span className="h-4 w-full animate-pulse rounded bg-surface-overlay" />
          <span className="h-4 w-5/6 animate-pulse rounded bg-surface-overlay" />
          <span className="h-4 w-2/3 animate-pulse rounded bg-surface-overlay" />
        </div>
      ) : note ? (
        <p className="mt-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
          {note}
        </p>
      ) : research.status === "loaded" ? (
        <ResearchBody result={research.result} />
      ) : null}
    </section>
  );
}

function ResearchBody({ result }: { result: ResearchResult }) {
  const hasBody =
    result.summary.length > 0 || result.finance.some((b) => b.content);

  return (
    <div className="mt-4 flex flex-col gap-4">
      {result.categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {result.categories.map((c) => (
            <span
              key={c}
              className="rounded-pill border border-line px-2 py-0.5 text-xs font-medium text-fg-muted"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {result.summary ? <Markdown source={result.summary} /> : null}

      {result.finance.map((block, i) =>
        block.content ? <Markdown key={i} source={block.content} /> : null,
      )}

      {!hasBody ? (
        <p className="text-sm text-fg-muted">
          No structured highlights were returned for this symbol.
        </p>
      ) : null}

      {result.sources.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Sources
          </p>
          <ul className="flex flex-col gap-1">
            {result.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent underline-offset-2 hover:underline"
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
        (metered) · retrieved {formatDateTime(result.usedAt)}
        {result.cost != null ? ` · $${result.cost.toFixed(4)}` : ""}. Context only
        — not a price or a recommendation.
      </p>
    </div>
  );
}
