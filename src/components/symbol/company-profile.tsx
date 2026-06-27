"use client";

import { formatCompactNumber } from "@/lib/format";
import {
  perplexityNote,
  useSymbolResearch,
} from "@/components/symbol/research-context";

/**
 * Right-rail company profile. The symbol is always known; every other field
 * comes from **Robinhood** `get_equity_fundamentals` (free, read-only) when
 * connected, else **Perplexity** as the metered fallback. Shows "—" until the
 * auto-loaded research resolves, or a short note when neither source has it.
 */

const SOURCE_LABEL = { robinhood: "Robinhood", perplexity: "Perplexity", fmp: "FMP" } as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="text-right text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function CompanyProfileRail({ symbol }: { symbol: string }) {
  const state = useSymbolResearch();
  const loading = state.status === "loading";
  const research = state.status === "loaded" ? state.research : null;
  const profile = research?.profile ?? null;

  const v = (s: string | null) => (loading ? "…" : (s ?? "—"));
  const employees =
    profile?.employees != null ? formatCompactNumber(profile.employees) : null;

  const note =
    research && !profile
      ? (perplexityNote(research.perplexity, research.perplexityReason) ??
        "Company profile is unavailable for this symbol.")
      : null;

  const sourceLabel = research?.profileSource
    ? SOURCE_LABEL[research.profileSource]
    : "Robinhood / Perplexity";

  return (
    <aside
      aria-labelledby="profile-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <h2
        id="profile-heading"
        className="font-serif text-[0.95rem] font-semibold text-fg"
      >
        Company profile
      </h2>

      <dl className="mt-3 divide-y divide-line">
        <Row label="Symbol" value={symbol} />
        <Row label="Exchange" value={v(profile?.exchange ?? null)} />
        <Row label="Sector" value={v(profile?.sector ?? null)} />
        <Row label="Industry" value={v(profile?.industry ?? null)} />
        <Row label="CEO" value={v(profile?.ceo ?? null)} />
        <Row label="Employees" value={loading ? "…" : (employees ?? "—")} />
        <Row label="Country" value={v(profile?.country ?? null)} />
        <Row label="IPO date" value={v(profile?.ipoDate ?? null)} />
        {profile?.domain ? (
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Website
            </dt>
            <dd className="truncate text-right text-sm">
              <a
                href={`https://${profile.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link underline-offset-2 hover:text-link-hover hover:underline"
              >
                {profile.domain}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {profile?.description ? (
        <p className="mt-3 border-t border-line pt-3 text-pretty text-sm leading-relaxed text-fg-muted">
          {profile.description}
        </p>
      ) : null}

      {note ? <p className="mt-3 text-xs text-fg-muted">{note}</p> : null}

      <p className="mt-3 border-t border-line pt-3 text-xs text-fg-muted">
        Profile via <span className="font-medium">{sourceLabel}</span> — context
        only.
      </p>
    </aside>
  );
}
