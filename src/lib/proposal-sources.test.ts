import { describe, expect, it } from "vitest";
import { buildProposalSources } from "./proposal-sources";
import type { ProposalLensBreakdown, TradeProposal } from "@/lib/types";

const CASH_FLOW = {
  operatingCashFlow: null,
  freeCashFlow: 1_000_000_000,
  netDebt: null,
  fcfYield: 0.04,
  fcfTrend: "growing" as const,
  debtToEquity: null,
  interestCoverage: null,
};
const DIVIDEND = {
  dividendYield: 0.02,
  payoutRatio: null,
  fcfPayout: null,
  fcfCoverage: 2.4,
  dividendCagr: null,
  growthStreakYears: 10,
};
const BENZINGA_SOURCE = {
  headline: "NOW lands a multi-year federal AI contract",
  publisher: "benzinga",
  url: "https://www.benzinga.com/news/now-federal-ai",
  publishedAt: "2026-06-26T13:00:00Z",
};

function lens(over: Partial<ProposalLensBreakdown> = {}): ProposalLensBreakdown {
  return {
    strategy: "value",
    limitPrice: 900,
    stopPrice: 850,
    takeProfit: 1000,
    targetType: "prior_high",
    qty: 1,
    riskPct: 0.01,
    relativeVolume: null,
    catalyst: null,
    catalystType: null,
    catalystSources: [],
    catalystState: null,
    convictionScore: 0.7,
    convictionTier: "high",
    confidence: 0.6,
    thesis: "t",
    reasoning: "r",
    redTeam: null,
    cashFlow: null,
    dividend: null,
    researchStatus: null,
    researchStatusReason: null,
    cashFlowSource: null,
    dividendSource: null,
    ...over,
  } as ProposalLensBreakdown;
}

function proposal(over: Partial<TradeProposal> = {}): TradeProposal {
  return {
    id: "manual-NOW-x",
    createdAt: "2026-06-28T09:30:00-04:00",
    pricedAt: "2026-06-28T09:30:00-04:00",
    researchAt: "2026-06-28T09:30:00-04:00",
    symbol: "NOW",
    ...over,
  } as unknown as TradeProposal;
}

describe("buildProposalSources — the NOW mapping", () => {
  // NOW: cash-flow from FMP, a Benzinga catalyst, no dividend by nature.
  const l = lens({
    cashFlow: CASH_FLOW,
    cashFlowSource: "fmp",
    dividend: null,
    catalyst: "Federal AI contract win",
    catalystType: "product_news",
    catalystSources: [BENZINGA_SOURCE],
  });
  const sources = buildProposalSources(proposal(), l);

  it("attributes technicals to Alpaca", () => {
    const s = sources.sourceFor("technical");
    expect(s?.key).toBe("alpaca");
    expect(s?.provider).toMatch(/Alpaca/);
  });

  it("attributes cash-flow to FMP", () => {
    const s = sources.sourceFor("cashFlow");
    expect(s?.key).toBe("fmp");
    expect(s?.provider).toMatch(/Financial Modeling Prep/);
  });

  it("attributes the catalyst to Alpaca News (Benzinga) with the real URL", () => {
    const s = sources.sourceFor("catalyst");
    expect(s?.key).toBe("alpaca-news");
    expect(s?.href).toBe(BENZINGA_SOURCE.url);
  });

  it("attributes reward:risk / sizing / conviction to Derived, not a provider", () => {
    const s = sources.sourceFor("derived");
    expect(s?.key).toBe("derived");
    expect(s?.provider).toMatch(/Derived/);
  });

  it("does NOT invent a Perplexity source (nothing on NOW came from it)", () => {
    expect(sources.list.some((s) => s.key === "perplexity")).toBe(false);
  });

  it("does NOT show a dividend source (NOW pays none)", () => {
    expect(sources.numberFor("dividend")).toBeNull();
  });

  it("numbers the used sources deterministically in provider order", () => {
    expect(sources.list.map((s) => s.key)).toEqual([
      "alpaca",
      "alpaca-news",
      "fmp",
      "derived",
    ]);
    expect(sources.list.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildProposalSources — provenance honesty", () => {
  it("attributes Perplexity-sourced cash-flow to Perplexity", () => {
    const s = buildProposalSources(
      proposal(),
      lens({ cashFlow: CASH_FLOW, cashFlowSource: "perplexity" }),
    );
    expect(s.sourceFor("cashFlow")?.key).toBe("perplexity");
  });

  it("labels cash-flow 'source not tracked' when data is present but no provider was recorded", () => {
    const s = buildProposalSources(
      proposal(),
      lens({ cashFlow: CASH_FLOW, cashFlowSource: null }),
    );
    expect(s.sourceFor("cashFlow")?.key).toBe("untracked");
    expect(s.sourceFor("cashFlow")?.provider).toMatch(/not tracked/i);
  });

  it("merges cash-flow + dividend onto ONE shared FMP number when both are FMP", () => {
    const s = buildProposalSources(
      proposal(),
      lens({
        cashFlow: CASH_FLOW,
        cashFlowSource: "fmp",
        dividend: DIVIDEND,
        dividendSource: "fmp",
      }),
    );
    expect(s.numberFor("cashFlow")).toBe(s.numberFor("dividend"));
    expect(s.list.filter((x) => x.key === "fmp")).toHaveLength(1);
    // The single FMP entry names both blocks it backed.
    expect(s.sourceFor("cashFlow")?.backed).toMatch(/dividend/i);
  });

  it("falls back to a Perplexity catalyst when there are no news sources", () => {
    const s = buildProposalSources(
      proposal(),
      lens({ catalyst: "AI demand inflection", catalystSources: [] }),
    );
    expect(s.sourceFor("catalyst")?.key).toBe("perplexity");
    expect(s.sourceFor("catalyst")?.href).toBeNull();
  });

  it("emits no catalyst source when there is no catalyst", () => {
    const s = buildProposalSources(proposal(), lens({ catalyst: null, catalystSources: [] }));
    expect(s.numberFor("catalyst")).toBeNull();
  });

  it("a trend lens with no value data shows only Alpaca + Derived", () => {
    const s = buildProposalSources(
      proposal(),
      lens({ strategy: "trend", cashFlow: null, dividend: null }),
    );
    expect(s.list.map((x) => x.key)).toEqual(["alpaca", "derived"]);
    expect(s.numberFor("cashFlow")).toBeNull();
  });
});
