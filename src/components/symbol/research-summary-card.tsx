"use client";

import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDateTime,
  formatPercent,
  toneForValue,
} from "@/lib/format";
import {
  RESEARCH_PROVIDER_LABEL,
  isResearchStale,
  researchAgeLabel,
} from "@/lib/research-display";
import type {
  EarningsQuarter,
  FinanceSection,
  SymbolResearch,
} from "@/lib/server/research/types";
import type { SymbolQuote } from "@/lib/symbol";
import { perplexityNote } from "@/components/symbol/research-context";

/**
 * Scannable AI research card. Parses nothing here — it renders the typed,
 * scaffolding-stripped `SymbolResearch` payload (built server-side): a distilled
 * thesis, key-metric chips, an earnings beat/miss strip, catalyst chips, and an
 * identity line, with full financials/transcript behind an expander. Reused on
 * the symbol page highlights so research looks consistent everywhere. Graceful:
 * empty sections are hidden (no empty headers) and the off/capped/unavailable
 * states degrade to a clear note pointing at the research link-outs.
 */
export function ResearchSummaryCard({
  research,
  quote,
  loading = false,
  onRefresh,
  refreshing = false,
}: {
  research: SymbolResearch | null;
  quote: SymbolQuote | null;
  loading?: boolean;
  /** When provided, renders the freshness label + a manual Refresh control. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const note = research ? perplexityNote(research.perplexity) : null;
  const hasContent =
    !!research &&
    ((research.summary?.length ?? 0) > 0 ||
      (research.earnings?.length ?? 0) > 0 ||
      (research.catalysts?.length ?? 0) > 0 ||
      research.fundamentals != null ||
      research.consensus != null ||
      (research.sections?.length ?? 0) > 0);

  return (
    <section
      aria-labelledby="ai-research-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="ai-research-heading"
          className="font-serif text-[0.95rem] font-semibold text-fg"
        >
          AI research highlights
        </h2>
        <div className="flex items-center gap-2.5">
          <p className="text-xs text-fg-muted">{sourceNote(research)}</p>
          {onRefresh ? (
            <FreshnessRefresh
              research={research}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      ) : research && hasContent ? (
        <CardBody research={research} quote={quote} />
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

/** Honest one-line provenance, e.g. "Perplexity Finance · capped · cached". */
function sourceNote(research: SymbolResearch | null): string {
  const parts = [RESEARCH_PROVIDER_LABEL];
  if (research?.perplexity === "capped") parts.push("capped");
  if (research?.cached) parts.push("cached");
  return parts.join(" · ");
}

/**
 * Freshness label ("fetched N ago", flagged stale past the threshold) + a manual
 * Refresh control. Refresh re-spends (a metered call), so it is disabled while a
 * refresh is in flight and when the daily research cap is hit. Display-only
 * staleness — it never auto-spends.
 */
function FreshnessRefresh({
  research,
  onRefresh,
  refreshing,
}: {
  research: SymbolResearch | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const fetchedAt = research?.fetchedAt ?? null;
  const age = researchAgeLabel(fetchedAt);
  const stale = isResearchStale(fetchedAt);
  const capped = research?.perplexity === "capped";

  return (
    <div className="flex items-center gap-2 text-xs">
      {refreshing ? (
        <span className="text-fg-muted">Refreshing…</span>
      ) : age ? (
        <span
          className={stale ? "font-medium text-warning" : "text-fg-muted"}
          title={fetchedAt ? new Date(fetchedAt).toLocaleString() : undefined}
        >
          fetched {age}
          {stale ? " · stale" : ""}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing || capped}
        aria-label="Refresh research"
        title={
          capped
            ? "Daily research cap reached — try again tomorrow"
            : "Re-fetch research (uses a metered call)"
        }
        className="rounded-pill border border-line bg-surface-overlay px-2.5 py-0.5 font-medium text-fg transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  );
}

function CardBody({
  research,
  quote,
}: {
  research: SymbolResearch;
  quote: SymbolQuote | null;
}) {
  return (
    <div className="mt-4 flex flex-col gap-5">
      {research.summary ? (
        <div className="text-pretty text-sm leading-relaxed text-fg">
          <Markdown source={research.summary} />
        </div>
      ) : null}

      <KeyMetricChips research={research} quote={quote} />

      {(research.earnings?.length ?? 0) > 0 ? (
        <EarningsStrip earnings={research.earnings} />
      ) : null}

      {(research.catalysts?.length ?? 0) > 0 ? (
        <Catalysts catalysts={research.catalysts} />
      ) : null}

      <IdentityLine research={research} />

      {(research.sections?.length ?? 0) > 0 ? (
        <FullDetail sections={research.sections} />
      ) : null}

      <p className="text-xs text-fg-muted">
        Source: {RESEARCH_PROVIDER_LABEL} (metered)
        {research.usedAt ? ` · retrieved ${formatDateTime(research.usedAt)}` : ""}
        {research.cost != null ? ` · $${research.cost.toFixed(4)}` : ""}
        {research.cached ? " · cached" : ""}. Context only — not a price or a
        recommendation.
      </p>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col gap-0.5 rounded-card border border-line bg-surface-overlay px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? "text-fg"}`}>
        {value}
      </span>
    </div>
  );
}

function toneClass(value: number | null | undefined): string {
  if (value == null) return "text-fg";
  const t = toneForValue(value);
  return t === "gain" ? "text-gain" : t === "loss" ? "text-loss" : "text-fg";
}

function KeyMetricChips({
  research,
  quote,
}: {
  research: SymbolResearch;
  quote: SymbolQuote | null;
}) {
  const f = research.fundamentals;
  const price = quote?.price;
  const changePct = quote?.changePct;
  const priceValue =
    price == null
      ? "—"
      : `${formatCurrency(price)}${
          changePct != null ? ` (${formatPercent(changePct)})` : ""
        }`;

  const pe =
    f?.peRatio == null ? "—" : f.peRatio < 0 ? "—/neg." : f.peRatio.toFixed(1);

  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="Price" value={priceValue} tone={toneClass(quote?.change)} />
      <Chip
        label="Market cap"
        value={f?.marketCap != null ? formatCompactCurrency(f.marketCap) : "—"}
      />
      <Chip
        label="EPS (ttm)"
        value={f?.eps != null ? f.eps.toFixed(2) : "—"}
      />
      <Chip label="P/E" value={pe} />
      <Chip
        label="Analyst stance"
        value={research.consensus?.rating ?? "—"}
      />
    </div>
  );
}

/** A fraction → "+4.3%" / "−2.1%" with tone, or "—" when null. */
function MovePct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-fg-muted">—</span>;
  return (
    <span className={`tabular-nums ${toneClass(value)}`}>
      {formatPercent(value)}
    </span>
  );
}

function quarterLabel(q: EarningsQuarter): string {
  const beat = q.beat === null ? "" : q.beat ? "beat" : "missed";
  const eps =
    q.epsActual != null
      ? `EPS ${q.epsActual.toFixed(2)}${
          q.epsEstimate != null ? ` vs ${q.epsEstimate.toFixed(2)} est` : ""
        }`
      : "EPS n/a";
  const move =
    q.priceMovePct != null
      ? `, ${formatPercent(q.priceMovePct)} after`
      : "";
  return `${q.period}: ${beat ? `${beat}, ` : ""}${eps}${move}`;
}

function EarningsStrip({ earnings }: { earnings: EarningsQuarter[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
        Earnings surprises
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {earnings.map((q, i) => (
          <li
            key={`${q.period}-${i}`}
            aria-label={quarterLabel(q)}
            className="flex flex-col gap-1 rounded-card border border-line bg-surface-overlay px-3 py-2"
          >
            <span className="text-[11px] font-medium text-fg-muted" aria-hidden>
              {q.period}
            </span>
            <span
              className="text-sm font-semibold tabular-nums text-fg"
              aria-hidden
            >
              {q.epsActual != null ? q.epsActual.toFixed(2) : "—"}
            </span>
            <span className="flex items-center justify-between gap-1" aria-hidden>
              {q.beat === null ? (
                <span className="text-[11px] text-fg-muted">—</span>
              ) : q.beat ? (
                <span className="rounded-pill border border-success-border bg-success-surface px-1.5 text-[10px] font-semibold uppercase text-success">
                  Beat
                </span>
              ) : (
                <span className="rounded-pill border border-danger-border bg-danger-surface px-1.5 text-[10px] font-semibold uppercase text-danger">
                  Miss
                </span>
              )}
              <span className="text-[11px]">
                <MovePct value={q.priceMovePct} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Catalysts({ catalysts }: { catalysts: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
        Catalysts
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {catalysts.map((c) => (
          <li
            key={c}
            className="rounded-pill border border-line bg-surface-overlay px-2.5 py-0.5 text-xs font-medium text-fg"
          >
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityLine({ research }: { research: SymbolResearch }) {
  const p = research.profile;
  if (!p) return null;
  const parts = [
    p.sector,
    p.industry,
    p.ceo,
    p.employees != null ? `${p.employees.toLocaleString("en-US")} employees` : null,
    p.ipoDate ? `IPO ${p.ipoDate}` : null,
  ].filter((x): x is string => !!x);
  if (parts.length === 0) return null;
  return (
    <p className="border-t border-line pt-3 text-xs text-fg-muted">
      {parts.join(" · ")}
    </p>
  );
}

function FullDetail({ sections }: { sections: FinanceSection[] }) {
  return (
    <details className="group rounded-card border border-line">
      <summary className="cursor-pointer list-none rounded-card px-4 py-2.5 text-sm font-medium text-fg marker:content-none hover:bg-surface-overlay">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="text-fg-muted transition-transform group-open:rotate-90"
            aria-hidden
          >
            ▶
          </span>
          View full financials &amp; transcript
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
        {sections.map((s, i) => (
          <div key={`${s.kind}-${i}`}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {s.title}
            </h4>
            {/* Wide tables scroll within their own container, never the page. */}
            <div className="overflow-x-auto">
              <Markdown source={s.content} />
            </div>
            {s.sources.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {s.sources.map((src) => (
                  <li key={src.url}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-link underline-offset-2 hover:text-link-hover hover:underline"
                    >
                      {src.title || src.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
