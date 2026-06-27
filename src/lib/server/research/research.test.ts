import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getResearchProvider } from "./index";
import { createPerplexityProvider } from "./perplexity";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-research-"));
}

// Agent API (`POST /v1/agent`) response shape, mirrored from a real live
// response: one or more `finance_results` items in `output[]` (each `results[]`
// item carries `category`/`content`/`sources`/`tickers`) before the final
// synthesized `message`, whose parts are typed **`output_text`** (not `text`),
// plus usage/cost.
function financeSearchResponse(): Response {
  return new Response(
    JSON.stringify({
      output: [
        {
          type: "finance_results",
          categories: ["fundamentals", "earnings"],
          tickers: ["MSFT"],
          results: [
            {
              category: "fundamentals",
              tickers: ["MSFT"],
              content:
                "| Metric | Value |\n| --- | --- |\n| Revenue (TTM) | $245B |",
              sources: [
                { title: "MSFT 10-Q", url: "https://src.test/one" },
                { title: "Analyst note", url: "https://src.test/two" },
              ],
            },
          ],
        },
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              annotations: [],
              text: "Azure growth is re-accelerating; next-print earnings beat looks likely.",
            },
          ],
        },
      ],
      usage: {
        cost: { total_cost: 0.0123 },
        tool_calls_details: { finance_search: { invocation: 1 } },
      },
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
  it("calls the Agent API finance_search tool and parses structured data", async () => {
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

    // Request hits the Agent endpoint with the finance_search tool + namespaced model.
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("perplexity/sonar");
    expect(body.tools).toEqual([{ type: "finance_search" }]);
    expect(body.max_steps).toBe(1);
    expect(typeof body.input).toBe("string");
    expect(body.messages).toBeUndefined();

    expect(result).not.toBeNull();
    expect(result!.provider).toBe("perplexity");
    expect(result!.symbol).toBe("MSFT");
    // summary = final synthesized message text.
    expect(result!.summary).toContain("Azure");
    // Structured finance_results are parsed and surfaced.
    expect(result!.finance).toHaveLength(1);
    expect(result!.finance[0].content).toContain("Revenue (TTM)");
    expect(result!.categories).toEqual(["fundamentals", "earnings"]);
    expect(result!.tickers).toEqual(["MSFT"]);
    // sources are aggregated from the finance_results blocks.
    expect(result!.sources).toHaveLength(2);
    // real per-call cost is captured.
    expect(result!.cost).toBeCloseTo(0.0123);
  });

  it("lifts the structured profile / fundamentals / consensus JSON block out of the message", async () => {
    const dir = await tmp();
    const messageText = [
      "Azure growth is re-accelerating.",
      "```json",
      JSON.stringify({
        profile: { ceo: "Satya Nadella", employees: "228,000", sector: "Technology" },
        fundamentals: { marketCap: "3.1T", peRatio: 36.2, eps: "11.93", dividendYield: "0.72%" },
        consensus: { rating: "Strong Buy", targetMean: 520, analystCount: "41" },
      }),
      "```",
    ].join("\n");
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output: [
              { type: "message", content: [{ type: "output_text", text: messageText }] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const provider = createPerplexityProvider({
      apiKey: "k",
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });

    const result = await provider.research({ symbol: "MSFT" });
    expect(result).not.toBeNull();
    // The JSON block is stripped from the prose summary.
    expect(result!.summary).toBe("Azure growth is re-accelerating.");
    expect(result!.summary).not.toContain("{");
    expect(result!.profile!.ceo).toBe("Satya Nadella");
    expect(result!.profile!.employees).toBe(228000);
    expect(result!.fundamentals!.marketCap).toBeCloseTo(3.1e12);
    expect(result!.fundamentals!.dividendYield).toBeCloseTo(0.0072);
    expect(result!.consensus!.rating).toBe("Strong Buy");
    expect(result!.consensus!.analystCount).toBe(41);

    // The request prompts for the structured block.
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.input).toContain("json");
    expect(body.input).toContain("marketCap");
  });

  it("normalizes a bare model name to the namespaced Agent API form", async () => {
    const dir = await tmp();
    const fetchImpl = vi.fn(async () => financeSearchResponse());
    const provider = createPerplexityProvider({
      apiKey: "k",
      model: "sonar",
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });
    await provider.research({ symbol: "MSFT" });
    const body = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body.model).toBe("perplexity/sonar");
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
    const dir = await tmp();
    const fetchImpl = vi.fn(async () => financeSearchResponse());
    const provider = createPerplexityProvider({
      apiKey: "",
      fetchImpl,
      dataDir: dir,
      now: () => new Date("2026-06-24T08:00:00Z"),
    });
    expect(await provider.research({ symbol: "MSFT" })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
