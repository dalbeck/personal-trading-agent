/**
 * Per-metric **source provenance** for the proposal detail page
 * (proposal-source-footnotes M1). Every displayed figure on `/proposals/[id]`
 * carries a footnote marker that jumps to a numbered Sources card; this pure
 * module derives that numbered registry + the per-category lookup from the
 * proposal + its active lens.
 *
 * **Honesty (non-negotiable).** Provenance is read from the producing layer —
 * never guessed. Technicals are Alpaca market data by architecture; the catalyst
 * carries its real `catalystSources` (Alpaca News / Benzinga) or the Perplexity
 * fallback; cash-flow / dividend carry the merge's `cashFlowSource` /
 * `dividendSource`; computed values (reward:risk, sizing, risk %, quantity,
 * conviction, model confidence, the thesis synthesis) are tagged **Derived** —
 * NOT a data provider, because they are calculated, not sourced. When a value
 * block's provider isn't recorded (older records), it is labelled "source not
 * tracked" rather than attributed to a guess.
 *
 * Pure + unit-tested (`proposal-sources.test.ts`).
 */
import type { ProposalLensBreakdown, TradeProposal } from "@/lib/types";
import { hasCashFlowData } from "@/lib/cash-flow";
import { hasDividendData } from "@/lib/dividend";

/** Stable provider keys, in the order they are numbered on the page. */
export type SourceKey =
  | "alpaca"
  | "alpaca-news"
  | "fmp"
  | "perplexity"
  | "untracked"
  | "derived";

/** The metric groups a footnote marker can sit beside. Metrics that share a
 *  category share a footnote number. */
export type SourceCategory =
  | "technical" // entry / stop / target levels, relative volume, price now
  | "catalyst" // the named catalyst + its headlines
  | "cashFlow" // the value lens's cash-flow block
  | "dividend" // the value lens's dividend block
  | "derived"; // reward:risk, sizing, risk %, qty, conviction, confidence, thesis

/** Fixed numbering order so the registry is deterministic across renders. */
const KEY_ORDER: SourceKey[] = [
  "alpaca",
  "alpaca-news",
  "fmp",
  "perplexity",
  "untracked",
  "derived",
];

const PROVIDER_LABEL: Record<SourceKey, string> = {
  alpaca: "Alpaca (IEX)",
  "alpaca-news": "Alpaca News (Benzinga)",
  fmp: "Financial Modeling Prep",
  perplexity: "Perplexity Finance",
  untracked: "Source not tracked",
  derived: "Derived (computed)",
};

export interface ProposalSource {
  /** 1-based footnote number, assigned in `KEY_ORDER`. */
  number: number;
  key: SourceKey;
  /** Display name of the provider. */
  provider: string;
  /** What this source backed on the page (the fields/sections). */
  backed: string;
  /** The relevant point-in-time stamp (pricedAt for market data, researchAt for
   *  research), or null. */
  timestamp: string | null;
  /** A link where one exists (the Benzinga headline URL), else null. */
  href: string | null;
}

export interface ProposalSources {
  /** The numbered, de-duplicated sources used on the page, in display order. */
  list: ProposalSource[];
  /** The footnote number for a metric category, or null when that category has
   *  no displayed source (e.g. no catalyst, trend lens for cash-flow). */
  numberFor(category: SourceCategory): number | null;
  /** The resolved source for a metric category, or null. */
  sourceFor(category: SourceCategory): ProposalSource | null;
}

/** Which provider a value-quality block is attributed to. A known source wins;
 *  data present with no recorded source → honestly "untracked", never guessed. */
function valueBlockKey(
  hasData: boolean,
  source: TradeProposal["cashFlowSource"],
): SourceKey | null {
  if (!hasData) return null;
  if (source === "perplexity") return "perplexity";
  if (source === "fmp") return "fmp";
  if (source === "robinhood") return "fmp"; // never the case for cash-flow/div, but map defensively
  return "untracked";
}

interface Contribution {
  category: SourceCategory;
  key: SourceKey;
  backed: string;
  timestamp: string | null;
  href: string | null;
}

/**
 * Build the numbered source registry + per-category lookup for a proposal's
 * active lens. The active lens (not the proposal) carries the cash-flow /
 * dividend provider + the catalyst sources, so this is lens-aware: the Sources
 * card follows the Trend/Value toggle.
 */
export function buildProposalSources(
  p: TradeProposal,
  lens: ProposalLensBreakdown,
): ProposalSources {
  const pricedAt = p.pricedAt ?? p.createdAt;
  const researchAt = p.researchAt ?? p.createdAt;

  const contributions: Contribution[] = [];

  // Technicals — Alpaca market data, always present (the levels are Alpaca-only
  // by charter). Anchored at pricedAt (when the levels were priced).
  contributions.push({
    category: "technical",
    key: "alpaca",
    backed: "Entry, stop & target levels, relative volume, price now",
    timestamp: pricedAt,
    href: null,
  });

  // Catalyst — the real news sources (Alpaca News / Benzinga) when present, else
  // the Perplexity curated-catalyst fallback when a catalyst exists with no news
  // sources. No catalyst → no contribution (nothing to attribute).
  const catalystSources = lens.catalystSources ?? [];
  if (catalystSources.length > 0) {
    const firstUrl = catalystSources.find((s) => s.url)?.url ?? null;
    const firstStamp =
      catalystSources.find((s) => s.publishedAt)?.publishedAt ?? researchAt;
    contributions.push({
      category: "catalyst",
      key: "alpaca-news",
      backed: "Catalyst & supporting headlines",
      timestamp: firstStamp,
      href: firstUrl,
    });
  } else if (lens.catalyst) {
    contributions.push({
      category: "catalyst",
      key: "perplexity",
      backed: "Catalyst (curated research phrase)",
      timestamp: researchAt,
      href: null,
    });
  }

  // Cash-flow / dividend — the value lens's quality blocks, attributed by the
  // recorded provider (FMP / Perplexity), honestly "untracked" when the source
  // wasn't recorded but data is present.
  const cashKey = valueBlockKey(hasCashFlowData(lens.cashFlow), lens.cashFlowSource);
  if (cashKey) {
    contributions.push({
      category: "cashFlow",
      key: cashKey,
      backed: "Cash-flow quality (FCF, FCF yield, leverage, coverage)",
      timestamp: researchAt,
      href: null,
    });
  }
  const divKey = valueBlockKey(hasDividendData(lens.dividend), lens.dividendSource);
  if (divKey) {
    contributions.push({
      category: "dividend",
      key: divKey,
      backed: "Dividend sustainability (yield, payout, coverage, streak)",
      timestamp: researchAt,
      href: null,
    });
  }

  // Derived — computed by the desk, NOT sourced. Always present (every proposal
  // carries sizing + reward:risk). Honesty: a calculation is not a data feed.
  contributions.push({
    category: "derived",
    key: "derived",
    backed:
      "Reward:risk, sizing & quantity, risk %, conviction score, model confidence, thesis synthesis",
    timestamp: p.createdAt,
    href: null,
  });

  // Group contributions by provider key, merge their `backed` text, keep the
  // first href / timestamp, then number them in the fixed display order.
  const byKey = new Map<SourceKey, ProposalSource>();
  for (const c of contributions) {
    const existing = byKey.get(c.key);
    if (existing) {
      if (!existing.backed.includes(c.backed)) {
        existing.backed = `${existing.backed}; ${c.backed}`;
      }
      existing.href = existing.href ?? c.href;
      existing.timestamp = existing.timestamp ?? c.timestamp;
    } else {
      byKey.set(c.key, {
        number: 0, // assigned below
        key: c.key,
        provider: PROVIDER_LABEL[c.key],
        backed: c.backed,
        timestamp: c.timestamp,
        href: c.href,
      });
    }
  }

  const list: ProposalSource[] = [];
  for (const key of KEY_ORDER) {
    const src = byKey.get(key);
    if (src) {
      src.number = list.length + 1;
      list.push(src);
    }
  }

  // Map each contributed category to its provider's footnote number.
  const categoryKey = new Map<SourceCategory, SourceKey>();
  for (const c of contributions) categoryKey.set(c.category, c.key);

  const sourceFor = (category: SourceCategory): ProposalSource | null => {
    const key = categoryKey.get(category);
    if (!key) return null;
    return list.find((s) => s.key === key) ?? null;
  };

  return {
    list,
    sourceFor,
    numberFor: (category) => sourceFor(category)?.number ?? null,
  };
}
