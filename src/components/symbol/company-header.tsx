"use client";

import { useState } from "react";
import { OwnershipBadge } from "@/components/mode-scope";
import { countryFlag } from "@/lib/format";
import type { Ownership } from "@/lib/universe";
import { useSymbolResearch } from "@/components/symbol/research-context";

/**
 * Perplexity-style company header: a monogram tile + the company name with a
 * `SYMBOL · EXCHANGE · 🇺🇸` meta line. The symbol + monogram are always known;
 * the name / exchange / country fill in from the auto-loaded research (Robinhood
 * or Perplexity). Falls back gracefully to the ticker when the name is missing.
 */
export function SymbolCompanyHeader({
  symbol,
  ownership,
}: {
  symbol: string;
  ownership: Ownership;
}) {
  const state = useSymbolResearch();
  const profile = state.status === "loaded" ? state.research.profile : null;
  const name = profile?.name ?? null;
  const exchange = profile?.exchange ?? null;
  const flag = countryFlag(profile?.country ?? null);

  const meta = [symbol, exchange].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3">
      <CompanyLogo symbol={symbol} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-fg">
            {name ?? symbol}
          </h1>
          <OwnershipBadge ownership={ownership} />
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">
          {meta}
          {flag ? (
            <>
              {" · "}
              <span aria-hidden>{flag}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/**
 * Brand logo by ticker (Financial Modeling Prep's stock-logo CDN) with a
 * graceful monogram fallback — an unknown ticker 404s and the image's onError
 * shows the monogram instead. Ticker-based so it works without Perplexity (no
 * domain needed). The only external request is the logo image itself.
 */
function CompanyLogo({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`}
        alt=""
        width={44}
        height={44}
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-11 shrink-0 rounded-card border border-line bg-surface-overlay object-contain p-1"
      />
    );
  }
  return <Monogram symbol={symbol} />;
}

/** A clean monogram tile used when no brand logo is available. */
function Monogram({ symbol }: { symbol: string }) {
  const initials = symbol.length <= 4 ? symbol : symbol.slice(0, 4);
  return (
    <div
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-card border border-line bg-surface-overlay text-[11px] font-bold tracking-tight text-fg"
    >
      {initials}
    </div>
  );
}
