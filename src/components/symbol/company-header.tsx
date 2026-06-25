"use client";

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
      <Monogram symbol={symbol} />
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

/** A clean monogram tile used in place of a brand logo (no external fetch). */
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
