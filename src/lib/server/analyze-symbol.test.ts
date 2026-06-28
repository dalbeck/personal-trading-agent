import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeSymbol } from "./analyze-symbol";
import { TradeProposalSchema } from "@/lib/schemas";
import type { Ohlc } from "@/lib/indicators";

/** A rising daily series long enough for the builder (≥30 bars). */
function ramp(n: number, start: number, step: number): Ohlc[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    return { o: c - 0.2, h: c + 0.5, l: c - 0.5, c, v: 1_000_000, t: `d${i}` };
  });
}

const snapshotSeam = () =>
  Promise.resolve({
    equity: 10_000,
    highWaterEquity: 10_000,
    openPositions: [],
  });

const researchSeam = () =>
  Promise.resolve({
    sector: "Information Technology",
    catalyst: "New product cycle",
    catalystType: "product_news" as const,
    cashFlow: null,
    dividend: null,
    researchStatus: "ok" as const,
    researchStatusReason: null as string | null,
    catalystSources: [],
    catalystState: "found" as const,
    cashFlowSource: null,
    dividendSource: null,
    usedPerplexity: false,
  });

const approveExec = () =>
  Promise.resolve(
    '{"verdict":"approve","notes":"Clean trend setup","factors":[],"basis":"ok"}',
  );
const rejectExec = () =>
  Promise.resolve(
    '{"verdict":"reject","notes":"Counter-trend, weak edge","factors":[],"basis":"no"}',
  );

describe("analyzeSymbol", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "analyze-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs the full pipeline and persists a manual-request proposal with the red-team verdict", async () => {
    const res = await analyzeSymbol("nvda", {
      account: "live",
      dataDir: dir,
      now: () => new Date("2026-06-26T09:00:00-04:00"),
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: approveExec,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.symbol).toBe("NVDA");
    expect(res.proposal.origin).toBe("manual-request");
    expect(res.proposal.account).toBe("live");
    expect(res.proposal.advisory).toBe(false);
    expect(res.proposal.status).toBe("pending");
    expect(res.redTeam.verdict).toBe("approve");
    expect(res.proposal.redTeam?.verdict).toBe("approve");
    expect(res.proposal.sector).toBe("Information Technology");

    // It was actually written to disk and validates against the contract.
    const files = await readdir(path.join(dir, "proposals"));
    expect(files.length).toBe(1);
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(p.origin).toBe("manual-request");
    expect(p.redTeam?.verdict).toBe("approve");
  });

  it("carries the catalyst's news sources onto the proposal + every lens (catalyst-news-sources M1)", async () => {
    const sources = [
      {
        headline: "Eli Lilly wins CHMP recommendation for EU approval",
        publisher: "Benzinga",
        url: "https://example.com/lly",
        publishedAt: "2026-06-26T13:30:00Z",
      },
    ];
    const res = await analyzeSymbol("lly", {
      account: "live",
      dataDir: dir,
      now: () => new Date("2026-06-26T09:00:00-04:00"),
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: () =>
        Promise.resolve({
          sector: "Health Care",
          catalyst: "CHMP recommends EU approval",
          catalystType: "product_news" as const,
          cashFlow: null,
          dividend: null,
          researchStatus: "ok" as const,
          researchStatusReason: null as string | null,
          catalystSources: sources,
          catalystState: "found" as const,
          cashFlowSource: null,
          dividendSource: null,
          usedPerplexity: true,
        }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.catalystSources).toEqual(sources);
    // Both lenses (trend + value) share the symbol's news sources.
    expect(res.proposal.lenses.length).toBeGreaterThan(0);
    for (const lens of res.proposal.lenses) {
      expect(lens.catalystSources).toEqual(sources);
    }
    // Persisted + validates against the contract.
    const files = await readdir(path.join(dir, "proposals"));
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(p.catalystSources).toEqual(sources);
  });

  it("a failed catalyst fetch carries 'unavailable' (never a silent 'no catalyst') onto the proposal + lenses (catalyst-state-honesty M2)", async () => {
    const res = await analyzeSymbol("lly", {
      account: "live",
      dataDir: dir,
      now: () => new Date("2026-06-26T09:00:00-04:00"),
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: () =>
        Promise.resolve({
          sector: null,
          catalyst: null,
          catalystType: null,
          cashFlow: null,
          dividend: null,
          researchStatus: "unavailable" as const,
          researchStatusReason: null as string | null,
          catalystSources: [],
          catalystState: "unavailable" as const,
          cashFlowSource: null,
          dividendSource: null,
          usedPerplexity: false,
        }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.catalystState).toBe("unavailable");
    // The trend lens (no dividend floor) inherits the unavailable state.
    const trendLens = res.proposal.lenses.find((l) => l.strategy === "trend");
    expect(trendLens?.catalystState).toBe("unavailable");
    // Persisted with the unavailable state.
    const files = await readdir(path.join(dir, "proposals"));
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(p.catalystState).toBe("unavailable");
  });

  it("persists the specific research failure reason on the proposal and value lens (research-observability M1)", async () => {
    // Use a deep downtrend so the value lens wins (higher conviction than trend),
    // ensuring the top-level proposal.researchStatusReason mirrors the value lens.
    const res = await analyzeSymbol("aapl", {
      account: "live",
      dataDir: dir,
      now: () => new Date("2026-06-26T09:00:00-04:00"),
      fetchBars: async () => ramp(220, 200, -0.3), // deep downtrend favors value
      readSnapshot: snapshotSeam,
      fetchResearch: () =>
        Promise.resolve({
          sector: "Information Technology",
          catalyst: null,
          catalystType: null,
          cashFlow: null,
          dividend: null,
          researchStatus: "unavailable" as const,
          researchStatusReason: "HTTP 402 (check API billing)",
          catalystSources: [],
          catalystState: "unavailable" as const,
          cashFlowSource: null,
          dividendSource: null,
          usedPerplexity: false,
        }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The value lens always carries the reason.
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    expect(valueLens?.researchStatusReason).toBe("HTTP 402 (check API billing)");
    // When the value lens is the active one, the top-level reason mirrors it.
    if (res.proposal.strategy === "value") {
      expect(res.proposal.researchStatusReason).toBe("HTTP 402 (check API billing)");
    } else {
      // Trend is active (rare with deep downtrend) — top-level reason is null, lens still has it.
      expect(res.proposal.researchStatusReason).toBeNull();
    }
  });

  it("does NOT rubber-stamp a weak pick — a red-team reject is surfaced, not hidden", async () => {
    const res = await analyzeSymbol("xyz", {
      account: "paper",
      dataDir: dir,
      fetchBars: async () => ramp(40, 100, -0.5), // downtrend
      readSnapshot: snapshotSeam,
      fetchResearch: () =>
        Promise.resolve({
          sector: null,
          catalyst: null,
          catalystType: null,
          cashFlow: null,
          dividend: null,
          researchStatus: "ok" as const,
          researchStatusReason: null as string | null,
          catalystSources: [],
          catalystState: "none" as const,
          cashFlowSource: null,
          dividendSource: null,
          usedPerplexity: false,
        }),
      redTeamExec: rejectExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.redTeam.verdict).toBe("reject");
    expect(res.proposal.account).toBe("paper");
    // The verdict is persisted with the proposal so the human sees it flagged.
    expect(res.proposal.redTeam?.verdict).toBe("reject");
  });

  it("a value proposal with UNKNOWN cash-flow is never 'high conviction' (conviction-honesty M1)", async () => {
    // A deep-discount value setup that, with quality data, could rank high — but
    // research returns NO cash-flow, so the value lens must be capped below high.
    const res = await analyzeSymbol("JKHY", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 200, -0.3), // long downtrend = cheap
      readSnapshot: snapshotSeam,
      fetchResearch: async () => ({
        sector: "Technology Services",
        catalyst: null,
        catalystType: null,
        cashFlow: null, // UNKNOWN quality data
        dividend: null,
        researchStatus: "ok" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: false,
      }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value")!;
    expect(valueLens.convictionTier).not.toBe("high");
    expect(valueLens.convictionScore as number).toBeLessThan(0.7);
  });

  it("records an explicit 'unavailable' research status that drags conviction + briefs the red-team (M3)", async () => {
    const prompts: string[] = [];
    const res = await analyzeSymbol("JKHY", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 200, -0.3),
      readSnapshot: snapshotSeam,
      // Research was CAPPED → no cash-flow data, and we say so explicitly.
      fetchResearch: async () => ({
        sector: "Technology Services",
        catalyst: null,
        catalystType: null,
        cashFlow: null,
        dividend: null,
        researchStatus: "capped" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: false,
      }),
      redTeamExec: async (p) => {
        prompts.push(p);
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value")!;
    // The status is stored explicitly (not a silent null) on the value lens…
    expect(valueLens.researchStatus).toBe("capped");
    // …drags conviction below high (the M1 penalty, fed by the unavailable data)…
    expect(valueLens.convictionTier).not.toBe("high");
    // …and the value red-team is told the quality is DATA UNAVAILABLE, not verified.
    const valuePrompt = prompts.find((p) => /VALUE \/ MEAN-REVERSION/.test(p))!;
    expect(valuePrompt).toMatch(/DATA UNAVAILABLE/);
    expect(valuePrompt).toMatch(/cap/i);
  });

  it("evaluates BOTH lenses → one proposal holding both breakdowns", async () => {
    const res = await analyzeSymbol("KR", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5), // a deep downtrend
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // One proposal (one row), holding both lens breakdowns.
    expect(res.proposal.lenses.map((l) => l.strategy)).toEqual([
      "trend",
      "value",
    ]);
    // Each lens carries its own red-team verdict + thesis.
    expect(res.proposal.lenses.every((l) => l.redTeam !== null)).toBe(true);
    expect(res.proposal.lenses[0].thesis).not.toBe(res.proposal.lenses[1].thesis);
    // Exactly one file on disk (not two rows), and it validates.
    const files = await readdir(path.join(dir, "proposals"));
    expect(files.length).toBe(1);
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(p.lenses).toHaveLength(2);
    // The active (top-level) strategy mirrors one of the two lenses.
    expect(["trend", "value"]).toContain(p.strategy);
  });

  it("briefs each lens under its OWN mandate (trend vs value red-team)", async () => {
    const prompts: string[] = [];
    const res = await analyzeSymbol("KR", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5),
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: async (p) => {
        prompts.push(p);
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    // Two red-team calls — one per lens.
    expect(prompts.length).toBe(2);
    const trendPrompt = prompts.find((p) => /TREND mandate/.test(p));
    const valuePrompt = prompts.find((p) => /VALUE \/ MEAN-REVERSION/.test(p));
    expect(trendPrompt).toBeDefined();
    expect(valuePrompt).toBeDefined();
    // The value lens expects counter-trend; the trend lens penalizes valuation.
    expect(valuePrompt).toMatch(/COUNTER-TREND IS EXPECTED/);
    expect(valuePrompt).not.toMatch(/out of mandate/i);
    expect(trendPrompt).toMatch(/out of mandate/i);
  });

  it("attaches cash-flow quality to the VALUE lens only and briefs the value red-team", async () => {
    const prompts: string[] = [];
    const cashFlow = {
      operatingCashFlow: 2_400_000_000,
      freeCashFlow: 2_000_000_000,
      fcfTrend: "stable" as const,
      fcfYield: 0.05,
      netDebt: 1_000_000_000,
      debtToEquity: 0.8,
      interestCoverage: 12,
    };
    const res = await analyzeSymbol("KR", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5),
      readSnapshot: snapshotSeam,
      fetchResearch: async () => ({
        sector: "Consumer Staples",
        catalyst: "Dividend support",
        catalystType: "other" as const,
        cashFlow,
        dividend: null,
        researchStatus: "ok" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "found" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: true,
      }),
      redTeamExec: async (p) => {
        prompts.push(p);
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const trendLens = res.proposal.lenses.find((l) => l.strategy === "trend");
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    // The value lens carries the cash-flow block; the trend lens does not.
    expect(valueLens?.cashFlow).toEqual(cashFlow);
    expect(trendLens?.cashFlow).toBeNull();

    // Only the value prosecutor is briefed with the cash-flow figures.
    const valuePrompt = prompts.find((p) => /VALUE \/ MEAN-REVERSION/.test(p));
    const trendPrompt = prompts.find((p) => /TREND mandate/.test(p));
    expect(valuePrompt).toMatch(/Cash-flow quality/i);
    expect(valuePrompt).toMatch(/FCF yield/i);
    expect(trendPrompt).not.toMatch(/Cash-flow quality/i);
  });

  it("registers a durable dividend as the value lens's named floor + briefs the value red-team", async () => {
    const prompts: string[] = [];
    const dividend = {
      dividendYield: 0.031,
      payoutRatio: 0.45,
      fcfPayout: 1 / 2.4,
      fcfCoverage: 2.4,
      growthStreakYears: 14,
      dividendCagr: 0.11,
    };
    const res = await analyzeSymbol("JKHY", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5), // counter-trend value entry
      readSnapshot: snapshotSeam,
      // No AI-summary catalyst → the dividend floor fills the "Unspecified" gap.
      fetchResearch: async () => ({
        sector: "Technology Services",
        catalyst: null,
        catalystType: null,
        cashFlow: null,
        dividend,
        researchStatus: "ok" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: true,
      }),
      redTeamExec: async (p) => {
        prompts.push(p);
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    const trendLens = res.proposal.lenses.find((l) => l.strategy === "trend");
    // The value lens carries the dividend block; the trend lens does not.
    expect(valueLens?.dividend).toEqual(dividend);
    expect(trendLens?.dividend).toBeNull();
    // The concrete floor is registered as the value catalyst (not "Unspecified").
    expect(valueLens?.catalyst).toBe(
      "Dividend floor: FCF covers 2.4×, 14-yr growth streak",
    );
    expect(valueLens?.catalystType).toBe("other");
    // The trend lens is untouched — no floor injected into it.
    expect(trendLens?.catalyst).toBeNull();

    // The value prosecutor is briefed with the dividend floor; trend is not.
    const valuePrompt = prompts.find((p) => /VALUE \/ MEAN-REVERSION/.test(p));
    const trendPrompt = prompts.find((p) => /TREND mandate/.test(p));
    expect(valuePrompt).toMatch(/Dividend sustainability \(pass/i);
    expect(trendPrompt).not.toMatch(/Dividend sustainability/i);
  });

  it("does NOT register a floor for an uncovered/at-risk dividend (no false floor)", async () => {
    const res = await analyzeSymbol("XYZ", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5),
      readSnapshot: snapshotSeam,
      fetchResearch: async () => ({
        sector: "Energy",
        catalyst: null,
        catalystType: null,
        cashFlow: null,
        dividend: {
          dividendYield: 0.09,
          payoutRatio: null,
          fcfPayout: null,
          fcfCoverage: 0.6, // FCF doesn't cover the dividend
          growthStreakYears: null,
          dividendCagr: null,
        },
        researchStatus: "ok" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: true,
      }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    // No floor registered — the catalyst stays absent (flagged weak by the checklist).
    expect(valueLens?.catalyst).toBeNull();
    // But the at-risk dividend block IS carried for the red-team / stat block.
    expect(valueLens?.dividend?.fcfCoverage).toBe(0.6);
  });

  it("fetches research ONCE for both lenses (respects the Perplexity cap)", async () => {
    let researchCalls = 0;
    await analyzeSymbol("KR", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: async () => {
        researchCalls += 1;
        return researchSeam();
      },
      redTeamExec: approveExec,
    });
    expect(researchCalls).toBe(1);
  });

  it("gives each same-day re-analysis of a symbol a distinct id + file", async () => {
    const common = {
      account: "live" as const,
      dataDir: dir,
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: approveExec,
    };
    const first = await analyzeSymbol("KR", {
      ...common,
      now: () => new Date("2026-06-26T18:28:30.056-04:00"),
    });
    const second = await analyzeSymbol("KR", {
      ...common,
      now: () => new Date("2026-06-26T19:04:32.321-04:00"),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Distinct ids → distinct /proposals/[id] URLs and no duplicate React key.
    expect(first.proposal.id).not.toBe(second.proposal.id);
    // Both persisted as separate files.
    const files = await readdir(path.join(dir, "proposals"));
    expect(files.length).toBe(2);
  });

  it("treats FMP-supplied cashFlow as available even when Perplexity is unavailable (fundamentals-fallback-fmp M2)", async () => {
    // RED→GREEN: when Perplexity is down but FMP filled cashFlow,
    // the value lens researchStatus must be "ok" and researchStatusReason null.
    // Use a deep downtrend so the value lens is the active one (tie-breaks trend).
    const cashFlow = {
      operatingCashFlow: 3_000_000_000,
      freeCashFlow: 2_500_000_000,
      fcfTrend: "growing" as const,
      fcfYield: 0.04,
      netDebt: null,
      debtToEquity: 0.5,
      interestCoverage: 15,
    };
    const res = await analyzeSymbol("AAPL", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(220, 200, -0.3), // deep downtrend → value lens active
      readSnapshot: snapshotSeam,
      fetchResearch: async () => ({
        sector: "Information Technology",
        catalyst: null,
        catalystType: null,
        // Perplexity was unavailable but FMP supplied cashFlow
        cashFlow,
        dividend: null,
        researchStatus: "unavailable" as const,
        researchStatusReason: "HTTP 402 (check API billing)",
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: false,
      }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The value lens always carries the research status and must show "ok" (FMP data present)
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    expect(valueLens?.researchStatus).toBe("ok");
    expect(valueLens?.researchStatusReason).toBeNull();
    expect(valueLens?.cashFlow).toEqual(cashFlow);
    // When the value lens is active (deep downtrend), the top-level status also reflects "ok"
    if (res.proposal.strategy === "value") {
      expect(res.proposal.researchStatus).toBe("ok");
      expect(res.proposal.researchStatusReason).toBeNull();
    }
  });

  it("falls through to perplexity status when neither cashFlow nor dividend is present (fundamentals-fallback-fmp M2)", async () => {
    // When FMP also has no value data, the perplexity status is the fallback.
    const res = await analyzeSymbol("XYZ", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: async () => ({
        sector: null,
        catalyst: null,
        catalystType: null,
        cashFlow: null,
        dividend: null,
        researchStatus: "capped" as const,
        researchStatusReason: null as string | null,
        catalystSources: [],
        catalystState: "none" as const,
        cashFlowSource: null,
        dividendSource: null,
        usedPerplexity: false,
      }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const valueLens = res.proposal.lenses.find((l) => l.strategy === "value");
    // Neither cashFlow nor dividend → mirrors the perplexity status ("capped")
    expect(valueLens?.researchStatus).toBe("capped");
  });

  it("rejects an invalid ticker before doing any work", async () => {
    const res = await analyzeSymbol("not a ticker!", { dataDir: dir });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid-symbol");
  });

  it("fails cleanly when the account has no snapshot to size against", async () => {
    const res = await analyzeSymbol("NVDA", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: async () => null,
      fetchResearch: researchSeam,
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("no-snapshot");
  });

  it("fails cleanly when there is too little price history", async () => {
    const res = await analyzeSymbol("NVDA", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(10, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("insufficient-data");
  });
});
