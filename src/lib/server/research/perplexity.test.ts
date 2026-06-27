// src/lib/server/research/perplexity.test.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerplexityProvider } from "./perplexity";
import { readResearchDiagnostics } from "./diagnostics";
import { getResearchCallCount } from "./usage";

let dir: string;
const clock = () => new Date("2026-06-27T12:00:00.000Z");

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pplx-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createPerplexityProvider diagnostics", () => {
  it("records no-api-key and returns null when the key is missing", async () => {
    const p = createPerplexityProvider({ apiKey: "", dataDir: dir, now: clock });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("no-api-key");
    expect((await readResearchDiagnostics({ dataDir: dir }))[0].outcome).toBe(
      "no-api-key",
    );
  });

  it("records http-error with status + body snippet on a non-200", async () => {
    const fetchImpl = (async () =>
      new Response("Payment Required: add credits", { status: 402 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    const d = p.lastDiagnostic?.();
    expect(d?.outcome).toBe("http-error");
    expect(d?.httpStatus).toBe(402);
    expect(d?.bodySnippet).toContain("Payment Required");
  });

  it("records timeout when the fetch aborts via TimeoutError", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("timeout");
  });

  it("records network-error on a generic fetch throw", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("network-error");
  });

  it("records daily-cap-reached when the cap is hit", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
      dailyCap: 0,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("daily-cap-reached");
  });

  it("records ok with latency on a 200", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ output: [] }), { status: 200 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).not.toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("ok");
    expect(await getResearchCallCount("2026-06-27", { dataDir: dir })).toBe(1);
  });
});

/** Build a 200 Agent API response whose final message carries `text`. */
function agentResponse(text: string, cost?: number): Response {
  return new Response(
    JSON.stringify({
      output: [
        { type: "message", content: [{ type: "output_text", text }] },
      ],
      ...(cost != null ? { usage: { cost: { total_cost: cost } } } : {}),
    }),
    { status: 200 },
  );
}

describe("createPerplexityProvider structured parse + truncation", () => {
  it("parses the full schema through cashFlow + dividend on a complete JSON-first response", async () => {
    const json = JSON.stringify({
      profile: { name: "Eli Lilly and Company", sector: "Healthcare" },
      fundamentals: { marketCap: "1.14T", peRatio: 41.01, eps: 29.42 },
      consensus: { rating: "Buy", targetMean: 950, analystCount: 25 },
      earnings: [{ period: "Q1 FY26", epsActual: 3.1, epsEstimate: 2.9 }],
      catalysts: ["Orforglipron Phase 3 readout"],
      cashFlow: {
        operatingCashFlow: "12B",
        freeCashFlow: "8B",
        fcfTrend: "growing",
        debtToEquity: 1.2,
        interestCoverage: 18,
      },
      dividend: {
        dividendYield: "0.7%",
        payoutRatio: "30%",
        fcfPayout: "25%",
        growthStreakYears: 10,
      },
    });
    const text = `\`\`\`json\n${json}\n\`\`\`\nLilly is executing on incretins.`;
    const fetchImpl = (async () =>
      agentResponse(text, 0.008)) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });

    const result = await p.research({ symbol: "LLY" });
    expect(result).not.toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("ok");
    // The whole schema survived — cashFlow + dividend (the previously-truncated tail) populate.
    expect(result!.cashFlow).not.toBeNull();
    expect(result!.cashFlow!.freeCashFlow).toBeCloseTo(8e9);
    expect(result!.cashFlow!.fcfTrend).toBe("growing");
    expect(result!.dividend).not.toBeNull();
    expect(result!.dividend!.growthStreakYears).toBe(10);
    expect(result!.consensus?.rating).toBe("Buy");
    expect(result!.profile?.name).toBe("Eli Lilly and Company");
  });

  it("detects a truncated JSON block, records `truncated`, and returns null (so FMP can fill in)", async () => {
    // The exact LLY failure shape: JSON-first, cut off mid-stream at consensus.
    const truncated =
      '```json\n{"profile":{"name":"Eli Lilly and Company"},"fundamentals":{"marketCap":"1.14T","peRatio":41.01,"eps":29.42,"dividendYield":"0.01%"},"cons';
    const fetchImpl = (async () =>
      agentResponse(truncated, 0.008)) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });

    // A truncated body must NOT be returned as a clean result with null cashFlow.
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("truncated");
    // It WAS billed, so it still counts against the daily cost cap.
    expect(await getResearchCallCount("2026-06-27", { dataDir: dir })).toBe(1);
  });

  it("requests a generous output-token budget (no 512 truncation)", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return agentResponse("```json\n{}\n```");
    }) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    await p.research({ symbol: "LLY" });
    expect(sentBody).not.toBeNull();
    expect(sentBody!.max_output_tokens as number).toBeGreaterThanOrEqual(3500);
  });
});
