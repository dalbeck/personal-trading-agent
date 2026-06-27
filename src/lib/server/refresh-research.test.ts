import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshProposalResearch } from "./refresh-research";
import type { ResearchContext } from "./analyze-symbol";
import { TradeProposalSchema } from "@/lib/schemas";
import type { Ohlc } from "@/lib/indicators";

/** A daily series ramping from `start` by `step`/day over `n` days. */
function ramp(n: number, start: number, step: number): Ohlc[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    return { o: c - 0.2, h: c + 0.5, l: c - 0.5, c, v: 1_000_000, t: `d${i}` };
  });
}

const approveExec = async () =>
  '{"verdict":"approve","notes":"ok","factors":[],"basis":"ok"}';

/** Research that came back EMPTY (the pre-fix truncation snapshot). */
function emptyResearch(): ResearchContext {
  return {
    sector: null,
    catalyst: null,
    catalystType: null,
    catalystSources: [],
    catalystState: "unavailable",
    cashFlow: null,
    dividend: null,
    researchStatus: "unavailable",
    researchStatusReason: "response truncated",
    usedPerplexity: false,
  };
}

/** Fresh research WITH value-quality data (post-fix / FMP-filled). */
function fullResearch(): ResearchContext {
  return {
    sector: "Health Technology",
    catalyst: "EMA approval Jul 9",
    catalystType: "product_news",
    catalystSources: [],
    catalystState: "found",
    cashFlow: {
      operatingCashFlow: 12e9,
      freeCashFlow: 8e9,
      fcfTrend: "growing",
      fcfYield: 0.04,
      netDebt: null,
      debtToEquity: 1.2,
      interestCoverage: 18,
    },
    dividend: {
      dividendYield: 0.007,
      payoutRatio: 0.3,
      fcfPayout: 0.25,
      fcfCoverage: 4,
      growthStreakYears: 10,
      dividendCagr: 0.12,
    },
    researchStatus: "ok",
    researchStatusReason: null,
    usedPerplexity: true,
  };
}

/** Seed a manual-request, dual-lens proposal whose stored research is STALE
 *  (cashFlow null, researchStatus unavailable — the pre-fix snapshot). */
async function seedProposal(dir: string, over: Record<string, unknown> = {}) {
  const lens = (strategy: "trend" | "value") => ({
    strategy,
    limitPrice: 800,
    stopPrice: 740,
    takeProfit: 980,
    targetType: "prior_high" as const,
    qty: 0.01,
    riskPct: 0.012,
    relativeVolume: 1.1,
    catalyst: null,
    catalystType: null,
    catalystState: "unavailable" as const,
    convictionScore: strategy === "value" ? 0.5 : 0.4,
    convictionTier: "moderate" as const,
    confidence: 0.5,
    thesis: `${strategy} thesis (stale)`,
    reasoning: `${strategy} reasoning`,
    redTeam: { verdict: "reject", notes: "stale", factors: [], basis: null },
    cashFlow: null,
    dividend: null,
    researchStatus: strategy === "value" ? ("unavailable" as const) : null,
    researchStatusReason: strategy === "value" ? "response truncated" : null,
  });
  const proposal = TradeProposalSchema.parse({
    id: "manual-LLY-1",
    createdAt: "2026-06-26T20:35:00.000Z",
    pricedAt: "2026-06-26T20:35:00.000Z",
    researchAt: "2026-06-26T20:35:00.000Z",
    symbol: "LLY",
    action: "buy",
    side: "long",
    strategy: "value",
    qty: 0.01,
    limitPrice: 800,
    stopPrice: 740,
    takeProfit: 980,
    targetType: "prior_high",
    sector: null,
    relativeVolume: 1.1,
    riskPct: 0.012,
    thesis: "stale value thesis",
    reasoning: "stale",
    status: "pending",
    account: "live",
    advisory: false,
    origin: "manual-request",
    catalystState: "unavailable",
    cashFlow: null,
    dividend: null,
    researchStatus: "unavailable",
    researchStatusReason: "response truncated",
    redTeam: { verdict: "reject", notes: "stale", factors: [], basis: null },
    lenses: [lens("trend"), lens("value")],
    ...over,
  });
  await mkdir(path.join(dir, "proposals"), { recursive: true });
  await writeFile(
    path.join(dir, "proposals", "manual-LLY-1.json"),
    JSON.stringify(proposal),
  );
}

describe("refreshProposalResearch", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "refresh-research-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("re-derives the value-lens cashFlow/dividend/researchStatus from FRESH research and overwrites in place", async () => {
    await seedProposal(dir);
    const res = await refreshProposalResearch("manual-LLY-1", {
      dataDir: dir,
      now: () => new Date("2026-06-27T14:00:00.000Z"),
      fetchBars: async () => ramp(60, 600, 4),
      fetchQuote: async () => 800,
      fetchResearch: async () => fullResearch(),
      readSnapshot: async () => ({ equity: 100_000 }),
      redTeamExec: approveExec,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // The value lens now carries the fresh cash-flow + dividend (was null).
    const value = res.proposal.lenses.find((l) => l.strategy === "value");
    expect(value?.cashFlow).not.toBeNull();
    expect(value?.cashFlow?.freeCashFlow).toBe(8e9);
    expect(value?.dividend).not.toBeNull();
    expect(value?.researchStatus).toBe("ok");
    // The stale red-team reject was re-run (fresh exec → approve).
    expect(value?.redTeam?.verdict).toBe("approve");
    // researchAt advanced to the refresh time; createdAt preserved.
    expect(res.proposal.researchAt).toBe("2026-06-27T14:00:00.000Z");
    expect(res.proposal.createdAt).toBe("2026-06-26T20:35:00.000Z");
    expect(res.researchAt).toBe("2026-06-27T14:00:00.000Z");

    // Same id, same file — overwritten in place, no new record minted.
    const files = await readdir(path.join(dir, "proposals"));
    expect(files).toHaveLength(1);
    const onDisk = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(onDisk.id).toBe("manual-LLY-1");
    expect(onDisk.status).toBe("pending");
    const onDiskValue = onDisk.lenses.find((l) => l.strategy === "value");
    expect(onDiskValue?.cashFlow?.freeCashFlow).toBe(8e9);
  });

  it("still re-derives (clears stale value data) when fresh research comes back empty", async () => {
    // Seed a proposal that previously HAD value data, then a refresh where research
    // is unavailable — the rebuild must reflect the new (empty) reality honestly,
    // not keep the old snapshot.
    await seedProposal(dir, {
      cashFlow: {
        operatingCashFlow: 1e9,
        freeCashFlow: 1e9,
        fcfTrend: "stable",
        fcfYield: 0.05,
        netDebt: null,
        debtToEquity: null,
        interestCoverage: null,
      },
      researchStatus: "ok",
    });
    const res = await refreshProposalResearch("manual-LLY-1", {
      dataDir: dir,
      now: () => new Date("2026-06-27T14:00:00.000Z"),
      fetchBars: async () => ramp(60, 600, 4),
      fetchQuote: async () => 800,
      fetchResearch: async () => emptyResearch(),
      readSnapshot: async () => ({ equity: 100_000 }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const value = res.proposal.lenses.find((l) => l.strategy === "value");
    expect(value?.cashFlow).toBeNull();
    expect(value?.researchStatus).toBe("unavailable");
  });

  it("refuses to rebuild a non-manual proposal (never reshapes a single-lens record)", async () => {
    await seedProposal(dir, { origin: "discovery", lenses: [] });
    const res = await refreshProposalResearch("manual-LLY-1", { dataDir: dir });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not-rebuildable");
  });

  it("returns not-found for an unknown proposal", async () => {
    const res = await refreshProposalResearch("nope", { dataDir: dir });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not-found");
  });
});
