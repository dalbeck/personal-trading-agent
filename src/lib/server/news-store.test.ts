import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MaterialNewsItem } from "@/lib/types";
import { validateDataDir } from "./validate-data";
import { recordNewsItems } from "./writers";

function item(link: string): MaterialNewsItem {
  return {
    symbol: "MSFT",
    title: "Azure guidance raised",
    link,
    source: "Markets",
    publishedAt: null,
    reason: "Mentions Microsoft (held: MSFT)",
    seenAt: "2026-06-24T12:00:00-04:00",
  };
}

describe("recordNewsItems", () => {
  it("writes a daily news file and dedupes by link across runs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-news-"));

    await recordNewsItems([item("https://x/1"), item("https://x/2")], {
      dataDir: dir,
    });
    // Second run re-sees /2 and adds /3.
    await recordNewsItems([item("https://x/2"), item("https://x/3")], {
      dataDir: dir,
    });

    expect(await validateDataDir(dir)).toEqual([]);
    const files = await readdir(path.join(dir, "news"));
    expect(files).toEqual(["2026-06-24.json"]);

    const arr = JSON.parse(
      await readFile(path.join(dir, "news", "2026-06-24.json"), "utf8"),
    ) as MaterialNewsItem[];
    expect(arr.map((a) => a.link).sort()).toEqual([
      "https://x/1",
      "https://x/2",
      "https://x/3",
    ]);
  });

  it("returns the count of newly-added (non-duplicate) items", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-news-"));
    const first = await recordNewsItems([item("https://x/1")], { dataDir: dir });
    const second = await recordNewsItems(
      [item("https://x/1"), item("https://x/9")],
      { dataDir: dir },
    );
    expect(first).toBe(1);
    expect(second).toBe(1); // only /9 is new
  });
});
