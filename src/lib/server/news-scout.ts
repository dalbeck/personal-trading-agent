import "server-only";

/**
 * News scout (Phase 2 M7, optional). Pulls public RSS and triages each headline
 * against the current paper **book** — material or not, and to which holding —
 * so only relevant events reach the research/red-team steps. Heuristic matching
 * by default (ticker word-boundary + company aliases); an optional `classify`
 * hook lets a small local model refine materiality. Network is injectable so the
 * logic is unit-tested offline.
 */

const TIMEOUT_MS = 8000;

export interface Headline {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
}

export interface BookItem {
  symbol: string;
  aliases?: string[];
}

export interface MaterialItem {
  headline: Headline;
  symbol: string;
  reason: string;
}

export interface Feed {
  url: string;
  source: string;
}

/** Classifier hook: return false to veto a heuristic match. */
export type Classifier = (headline: Headline, symbol: string) => boolean;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(item: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(item);
  return m ? decodeEntities(m[1]) : null;
}

/** Parse RSS 2.0 / Atom-ish XML into headlines. Regex-based — no XML dep. */
export function parseRss(xml: string, source: string): Headline[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: Headline[] = [];
  for (const item of items) {
    const title = tag(item, "title");
    const link = tag(item, "link");
    if (!title || !link) continue;
    out.push({
      title,
      link,
      source,
      publishedAt: tag(item, "pubDate") ?? tag(item, "published"),
    });
  }
  return out;
}

export async function fetchHeadlines(
  feeds: Feed[],
  opts?: { fetchImpl?: typeof fetch },
): Promise<Headline[]> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const res = await doFetch(feed.url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return [];
        return parseRss(await res.text(), feed.source);
      } catch {
        return []; // a flaky feed shouldn't sink the scan
      }
    }),
  );
  return results.flat();
}

function mentions(title: string, term: string): boolean {
  // Word-boundary, case-insensitive — "AMD" must not match "AMDOCS".
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(title);
}

/** Keep only headlines material to a held name. First matching book item wins. */
export function triage(
  headlines: Headline[],
  book: BookItem[],
  opts?: { classify?: Classifier },
): MaterialItem[] {
  const material: MaterialItem[] = [];
  for (const headline of headlines) {
    for (const item of book) {
      const terms = [item.symbol, ...(item.aliases ?? [])];
      const hit = terms.find((t) => mentions(headline.title, t));
      if (!hit) continue;
      if (opts?.classify && !opts.classify(headline, item.symbol)) break;
      material.push({
        headline,
        symbol: item.symbol,
        reason: `Mentions ${hit} (held: ${item.symbol})`,
      });
      break; // one tag per headline
    }
  }
  return material;
}

/** Public market RSS feeds (override with the NEWS_FEEDS env var). */
export const DEFAULT_FEEDS: Feed[] = [
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    source: "MarketWatch",
  },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
  {
    url: "https://finance.yahoo.com/news/rssindex",
    source: "Yahoo Finance",
  },
];

/** A small ticker → name/alias map so headlines that name the company (not the
 *  ticker) still match. Extend as the universe grows. */
export const COMPANY_ALIASES: Record<string, string[]> = {
  MSFT: ["Microsoft", "Azure"],
  AAPL: ["Apple"],
  NVDA: ["Nvidia"],
  AMD: ["Advanced Micro Devices"],
  GOOGL: ["Google", "Alphabet"],
  AMZN: ["Amazon"],
  META: ["Meta", "Facebook"],
  TSLA: ["Tesla"],
  COST: ["Costco"],
  COIN: ["Coinbase"],
  PLTR: ["Palantir"],
  SMCI: ["Super Micro", "Supermicro"],
};

/** Build a book (symbol + aliases) from held tickers. */
export function bookFromSymbols(symbols: string[]): BookItem[] {
  return symbols.map((symbol) => ({
    symbol,
    aliases: COMPANY_ALIASES[symbol] ?? [],
  }));
}

export async function runNewsScout(opts: {
  feeds: Feed[];
  book: BookItem[];
  fetchImpl?: typeof fetch;
  classify?: Classifier;
}): Promise<MaterialItem[]> {
  const headlines = await fetchHeadlines(opts.feeds, {
    fetchImpl: opts.fetchImpl,
  });
  return triage(headlines, opts.book, { classify: opts.classify });
}
