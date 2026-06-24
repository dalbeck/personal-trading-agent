import type { MaterialNewsItem } from "@/lib/types";
import { readLatestSnapshot } from "@/lib/server/data";
import {
  bookFromSymbols,
  DEFAULT_FEEDS,
  type Feed,
  runNewsScout,
} from "@/lib/server/news-scout";
import { recordNewsItems } from "@/lib/server/writers";

/**
 * One scout scan cycle: fetch the RSS feeds, triage each headline against the
 * current paper book, and persist the material items to `data/news/`. The
 * always-on `scripts/news-scout.sh` curls this on an interval (supervised by
 * `scripts/watchdog.sh`). Read-only w.r.t. trading — it never places orders.
 *
 * LOCAL only; optionally gated by `ROUTINE_TRIGGER_TOKEN`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFeeds(): Feed[] {
  const raw = process.env.NEWS_FEEDS;
  if (!raw) return DEFAULT_FEEDS;
  // Format: "url|Source, url|Source"
  const feeds = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, source] = part.split("|");
      return { url: url.trim(), source: (source ?? "RSS").trim() };
    })
    .filter((f) => f.url);
  return feeds.length > 0 ? feeds : DEFAULT_FEEDS;
}

export async function POST(req: Request): Promise<Response> {
  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await readLatestSnapshot("paper");
  const symbols = snapshot?.positions.map((p) => p.symbol) ?? [];
  if (symbols.length === 0) {
    return Response.json({ book: 0, material: 0, added: 0 });
  }

  const material = await runNewsScout({
    feeds: parseFeeds(),
    book: bookFromSymbols(symbols),
  });

  const seenAt = new Date().toISOString();
  const items: MaterialNewsItem[] = material.map((m) => ({
    symbol: m.symbol,
    title: m.headline.title,
    link: m.headline.link,
    source: m.headline.source,
    publishedAt: m.headline.publishedAt,
    reason: m.reason,
    seenAt,
  }));

  const added = await recordNewsItems(items);
  return Response.json({ book: symbols.length, material: items.length, added });
}
