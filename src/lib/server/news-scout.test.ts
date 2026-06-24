import { describe, expect, it, vi } from "vitest";
import {
  fetchHeadlines,
  type Headline,
  parseRss,
  runNewsScout,
  triage,
} from "./news-scout";

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Markets</title>
  <item>
    <title><![CDATA[Microsoft raises Azure guidance on Copilot demand]]></title>
    <link>https://news.test/msft-azure</link>
    <pubDate>Wed, 24 Jun 2026 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Fed holds rates steady</title>
    <link>https://news.test/fed</link>
    <pubDate>Wed, 24 Jun 2026 11:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe("parseRss", () => {
  it("extracts items with title, link, and date (handling CDATA)", () => {
    const items = parseRss(SAMPLE, "Markets");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Microsoft raises Azure guidance on Copilot demand",
      link: "https://news.test/msft-azure",
      source: "Markets",
    });
    expect(items[0].publishedAt).not.toBeNull();
  });
});

describe("fetchHeadlines", () => {
  it("aggregates headlines across feeds", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(SAMPLE, { status: 200 }),
    );
    const items = await fetchHeadlines(
      [
        { url: "https://a.test/rss", source: "A" },
        { url: "https://b.test/rss", source: "B" },
      ],
      { fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.source)).toContain("A");
    expect(items.map((i) => i.source)).toContain("B");
  });

  it("skips a feed that fails without sinking the rest", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("bad")
        ? new Response("err", { status: 500 })
        : new Response(SAMPLE, { status: 200 }),
    );
    const items = await fetchHeadlines(
      [
        { url: "https://good.test/rss", source: "G" },
        { url: "https://bad.test/rss", source: "B" },
      ],
      { fetchImpl },
    );
    expect(items).toHaveLength(2); // only the good feed
  });
});

describe("triage", () => {
  const book = [
    { symbol: "MSFT", aliases: ["Microsoft", "Azure"] },
    { symbol: "AMD" },
  ];

  it("keeps only headlines material to a held name", () => {
    const headlines: Headline[] = [
      ...parseRss(SAMPLE, "Markets"), // Microsoft headline + Fed headline
      {
        title: "AMD unveils next-gen GPU lineup",
        link: "https://news.test/amd-gpu",
        source: "Markets",
        publishedAt: null,
      },
    ];
    const material = triage(headlines, book);
    expect(material.map((m) => m.symbol).sort()).toEqual(["AMD", "MSFT"]);
    // The Fed headline (unrelated to the book) is dropped.
    expect(material.some((m) => m.headline.link.includes("/fed"))).toBe(false);
  });

  it("matches a ticker by word boundary, not a substring", () => {
    const headlines = [
      {
        title: "AMDOCS reports earnings", // contains "AMD" but is a different co.
        link: "https://x/amdocs",
        source: "S",
        publishedAt: null,
      },
    ];
    expect(triage(headlines, [{ symbol: "AMD" }])).toHaveLength(0);
  });

  it("lets an optional classifier veto a heuristic match", () => {
    const headlines = parseRss(SAMPLE, "Markets");
    const classify = vi.fn(() => false); // nothing is material
    expect(triage(headlines, book, { classify })).toHaveLength(0);
    expect(classify).toHaveBeenCalled();
  });
});

describe("runNewsScout", () => {
  it("fetches, triages, and returns material items", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(SAMPLE, { status: 200 }),
    );
    const material = await runNewsScout({
      feeds: [{ url: "https://a.test/rss", source: "A" }],
      book: [{ symbol: "MSFT", aliases: ["Microsoft"] }],
      fetchImpl,
    });
    expect(material).toHaveLength(1);
    expect(material[0].symbol).toBe("MSFT");
  });
});
