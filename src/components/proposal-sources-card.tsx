import { ArrowUpRightIcon, InfoIcon } from "@/components/icons";
import type { ProposalSource, ProposalSources } from "@/lib/proposal-sources";

/**
 * Source footnotes for the proposal detail page (proposal-source-footnotes M1).
 * `SourceMarker` is the small superscript anchor that sits beside a metric;
 * `ProposalSourcesCard` is the canonical numbered Sources list it jumps to,
 * placed in the sidebar directly under the Export card. One source of truth — the
 * list is rendered once; on narrow screens the sidebar stacks below the main
 * column, so the Sources naturally land at the bottom of the page.
 *
 * Accessible: each marker is a real link with an `aria-label` ("source 2: FMP");
 * each list item carries the matching `id` and is focusable (`tabIndex={-1}`) so
 * the jump-link lands focus on the target.
 */

const SHORT_PROVIDER: Record<string, string> = {
  alpaca: "Alpaca",
  "alpaca-news": "Alpaca News",
  fmp: "FMP",
  perplexity: "Perplexity",
  untracked: "untracked",
  derived: "Derived",
};

function shortLabel(s: ProposalSource): string {
  return SHORT_PROVIDER[s.key] ?? s.provider;
}

/** A superscript footnote marker — a real anchor that jumps to the Sources card.
 *  Renders nothing when the metric has no resolved source. */
export function SourceMarker({ source }: { source: ProposalSource | null }) {
  if (!source) return null;
  return (
    <a
      href={`#source-${source.number}`}
      aria-label={`source ${source.number}: ${source.provider}`}
      className="ml-0.5 align-super text-[0.6rem] font-semibold leading-none text-link no-underline transition-colors hover:text-link-hover hover:underline focus-visible:rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {source.number}
    </a>
  );
}

/** Format a source timestamp as a short date, or null when absent. */
function sourceDate(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The numbered Sources list — the single jump-link target for every marker on
 *  the page. Grouped by provider (not per-field) to stay compact. */
export function ProposalSourcesCard({ sources }: { sources: ProposalSources }) {
  if (sources.list.length === 0) return null;
  return (
    <section
      aria-labelledby="proposal-sources-heading"
      className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-raised p-5"
    >
      <div>
        <h2
          id="proposal-sources-heading"
          className="flex items-center gap-1.5 font-serif text-base font-semibold text-fg"
        >
          <InfoIcon className="size-4 text-fg-muted" />
          Sources
        </h2>
        <p className="mt-0.5 text-xs text-fg-muted">
          Where each figure came from — the superscript markers above jump here.
          Computed values are tagged <span className="font-medium">Derived</span>,
          not a data provider.
        </p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {sources.list.map((s) => {
          const date = sourceDate(s.timestamp);
          return (
            <li
              key={s.number}
              id={`source-${s.number}`}
              tabIndex={-1}
              className="flex gap-2.5 scroll-mt-4 rounded-input target:bg-accent/5 focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface text-xs font-semibold tabular-nums text-fg-muted"
              >
                {s.number}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {s.provider}
                  <span className="sr-only"> (source {s.number})</span>
                </p>
                <p className="text-pretty text-xs leading-snug text-fg-muted">
                  {s.backed}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
                  {date ? <span className="tabular-nums">{date}</span> : null}
                  {s.href ? (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-link transition-colors hover:text-link-hover"
                    >
                      View headline
                      <ArrowUpRightIcon className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Convenience: the short provider label for inline use (e.g. tooltips). */
export { shortLabel as sourceShortLabel };
