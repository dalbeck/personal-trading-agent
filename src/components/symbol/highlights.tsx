"use client";

import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { ResearchResult } from "@/lib/server/research/types";

/**
 * On-demand symbol highlights (M2). A single user click POSTs to the capped
 * Perplexity `finance_search` route — nothing runs until the button is pressed.
 * When the provider is off or the daily cap is hit, it shows a clear note that
 * points to the research link-outs below (rendered elsewhere on the page), never
 * an error. The metered source is labeled. Rendered via the safe markdown
 * pipeline since the content is provider-generated.
 */

type HighlightsResponse = {
  off?: boolean;
  capped?: boolean;
  result?: ResearchResult | null;
  error?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; result: ResearchResult }
  | { kind: "off" }
  | { kind: "capped" }
  | { kind: "unavailable" };

export function SymbolHighlights({ symbol }: { symbol: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/symbol/${encodeURIComponent(symbol)}/highlights`,
        { method: "POST" },
      );
      const data = (await res.json()) as HighlightsResponse;
      if (data.result) {
        setState({ kind: "loaded", result: data.result });
      } else if (data.off) {
        setState({ kind: "off" });
      } else if (data.capped) {
        setState({ kind: "capped" });
      } else {
        setState({ kind: "unavailable" });
      }
    } catch {
      setState({ kind: "unavailable" });
    }
  }

  const note =
    state.kind === "off"
      ? "AI highlights are turned off. They’re a metered add-on (Perplexity) and stay off by default — use the research links below instead."
      : state.kind === "capped"
        ? "Today’s highlights limit has been reached (the daily cap keeps cost bounded). Try again tomorrow, or use the research links below."
        : state.kind === "unavailable"
          ? "Highlights are unavailable right now — use the research links below."
          : null;

  return (
    <section
      aria-labelledby="highlights-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="highlights-heading" className="text-sm font-semibold text-fg">
            AI highlights
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            On-demand fundamentals, earnings, analyst views &amp; catalysts via
            Perplexity <span className="font-medium">finance_search</span>{" "}
            — metered &amp; capped, you trigger each one.
          </p>
        </div>
        {state.kind !== "loaded" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={load}
            disabled={state.kind === "loading"}
          >
            {state.kind === "loading" ? "Loading…" : "Load highlights"}
          </Button>
        ) : null}
      </div>

      {note ? (
        <p className="mt-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
          {note}
        </p>
      ) : null}

      {state.kind === "loaded" ? (
        <HighlightsResult result={state.result} />
      ) : null}
    </section>
  );
}

function HighlightsResult({ result }: { result: ResearchResult }) {
  const hasBody =
    result.summary.length > 0 || result.finance.some((f) => f.content);

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
        block.content ? (
          <Markdown key={i} source={block.content} />
        ) : null,
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
        {result.cost != null ? ` · $${result.cost.toFixed(4)}` : ""}. Context
        only — not a price or a recommendation.
      </p>
    </div>
  );
}
