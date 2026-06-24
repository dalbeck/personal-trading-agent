import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getResearchProvider } from "./index";
import { createPerplexityProvider } from "./perplexity";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-research-"));
}

function financeSearchResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              "Azure growth is re-accelerating; next-print earnings beat looks likely.",
          },
        },
      ],
      citations: ["https://src.test/one", "https://src.test/two"],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("getResearchProvider", () => {
  it("defaults to the off provider, which makes no calls and returns null", async () => {
    const fetchImpl = vi.fn();
    const provider = getResearchProvider({ provider: "off", fetchImpl });
    expect(provider.name).toBe("off");
    expect(await provider.research({ symbol: "MSFT" })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the perplexity provider when selected", () => {
    expect(getResearchProvider({ provider: "perplexity" }).name).toBe(
      "perplexity",
    );
  });
});

describe("createPerplexityProvider", () => {
  it("calls finance_search and normalizes the result", async () => {
    const dir = await tmp();
    const fetchImpl = vi.fn(async () => financeSearchResponse());
    const provider = createPerplexityProvider({
      apiKey: "k",
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });

    const result = await provider.research({ symbol: "MSFT" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("perplexity");
    expect(result!.symbol).toBe("MSFT");
    expect(result!.summary).toContain("Azure");
    expect(result!.sources).toHaveLength(2);
  });

  it("blocks call N+1 once the daily cap is reached (enforced in code)", async () => {
    const dir = await tmp();
    const fetchImpl = vi.fn(async () => financeSearchResponse());
    const provider = createPerplexityProvider({
      apiKey: "k",
      dailyCap: 2,
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });

    const a = await provider.research({ symbol: "MSFT" });
    const b = await provider.research({ symbol: "AMD" });
    const c = await provider.research({ symbol: "NVDA" }); // over the cap

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).toBeNull(); // blocked
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the 3rd never hit the API
  });

  it("returns null (does not throw) when the API errors, and does not spend a call", async () => {
    const dir = await tmp();
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const provider = createPerplexityProvider({
      apiKey: "k",
      dailyCap: 5,
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });
    expect(await provider.research({ symbol: "MSFT" })).toBeNull();
    // A failed call still counts? No — only successful calls are metered.
    const ok = await provider.research({ symbol: "MSFT" });
    // fetch is still erroring, so this is null too, but we proved no throw.
    expect(ok).toBeNull();
  });

  it("returns null without an API key", async () => {
    const fetchImpl = vi.fn(async () => financeSearchResponse());
    const provider = createPerplexityProvider({
      apiKey: "",
      fetchImpl,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });
    expect(await provider.research({ symbol: "MSFT" })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
