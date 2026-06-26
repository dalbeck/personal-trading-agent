import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshProposalLevels } from "./refresh-levels";
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

/** Write a manual dual-lens proposal whose entry is STALE ($135) into the dir. */
async function seedProposal(dir: string, over: Record<string, unknown> = {}) {
  const lens = (strategy: "trend" | "value") => ({
    strategy,
    limitPrice: 135,
    stopPrice: 126.5,
    takeProfit: 191,
    targetType: "prior_high" as const,
    qty: 0.04,
    riskPct: 0.012,
    relativeVolume: 1.2,
    catalyst: null,
    catalystType: null,
    convictionScore: strategy === "value" ? 0.6 : 0.4,
    convictionTier: "moderate" as const,
    confidence: 0.5,
    thesis: `${strategy} thesis (stale)`,
    reasoning: `${strategy} reasoning`,
    redTeam: { verdict: "reject", notes: "stale entry", factors: [], basis: null },
  });
  const proposal = TradeProposalSchema.parse({
    id: "manual-JKHY-1",
    createdAt: "2026-06-26T20:35:00.000Z",
    pricedAt: "2026-06-26T20:35:00.000Z",
    symbol: "JKHY",
    action: "buy",
    side: "long",
    strategy: "value",
    qty: 0.04,
    limitPrice: 135,
    stopPrice: 126.5,
    takeProfit: 191,
    targetType: "prior_high",
    sector: "Technology Services",
    relativeVolume: 1.2,
    riskPct: 0.012,
    thesis: "stale value thesis",
    reasoning: "stale",
    status: "pending",
    account: "live",
    advisory: false,
    origin: "manual-request",
    redTeam: { verdict: "reject", notes: "stale entry", factors: [], basis: null },
    lenses: [lens("trend"), lens("value")],
    ...over,
  });
  await mkdir(path.join(dir, "proposals"), { recursive: true });
  await writeFile(
    path.join(dir, "proposals", "manual-JKHY-1.json"),
    JSON.stringify(proposal),
  );
}

describe("refreshProposalLevels", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "refresh-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("re-anchors every lens's levels to the fresh quote and overwrites in place", async () => {
    await seedProposal(dir);
    const res = await refreshProposalLevels("manual-JKHY-1", {
      dataDir: dir,
      now: () => new Date("2026-06-27T14:00:00.000Z"),
      fetchBars: async () => ramp(60, 100, 0.5), // last close 129.5
      fetchQuote: async () => 128, // the CURRENT price
      readSnapshot: async () => ({ equity: 10_000 }),
      redTeamExec: approveExec,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Entry now equals the live quote, not the stale 135.
    expect(res.proposal.limitPrice).toBeCloseTo(128, 6);
    expect(res.proposal.lenses.every((l) => l.limitPrice === 128)).toBe(true);
    // Stop + target recomputed off 128.
    expect(res.proposal.stopPrice as number).toBeLessThan(128);
    // pricedAt advanced to the refresh time.
    expect(res.proposal.pricedAt).toBe("2026-06-27T14:00:00.000Z");
    // The red-team was re-run (verdict reflects the fresh exec, not the stale reject).
    expect(res.proposal.redTeam?.verdict).toBe("approve");

    // It overwrote the SAME file (one proposal, same id) — no new record minted.
    const files = await readdir(path.join(dir, "proposals"));
    expect(files).toHaveLength(1);
    const onDisk = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(onDisk.limitPrice).toBeCloseTo(128, 6);
    expect(onDisk.id).toBe("manual-JKHY-1");
    expect(onDisk.status).toBe("pending");
  });

  it("preserves a single-lens proposal's empty lenses array", async () => {
    await seedProposal(dir, { lenses: [], strategy: "trend" });
    const res = await refreshProposalLevels("manual-JKHY-1", {
      dataDir: dir,
      fetchBars: async () => ramp(60, 100, 0.5),
      fetchQuote: async () => 120,
      readSnapshot: async () => ({ equity: 10_000 }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.lenses).toEqual([]);
    expect(res.proposal.limitPrice).toBeCloseTo(120, 6);
  });

  it("returns no-quote (and leaves levels unchanged) when the quote can't be read", async () => {
    await seedProposal(dir);
    const res = await refreshProposalLevels("manual-JKHY-1", {
      dataDir: dir,
      fetchBars: async () => ramp(60, 100, 0.5),
      fetchQuote: async () => null,
      readSnapshot: async () => ({ equity: 10_000 }),
      redTeamExec: approveExec,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("no-quote");
    // The stale levels are untouched on disk.
    const onDisk = TradeProposalSchema.parse(
      JSON.parse(
        await readFile(path.join(dir, "proposals", "manual-JKHY-1.json"), "utf8"),
      ),
    );
    expect(onDisk.limitPrice).toBe(135);
  });

  it("returns not-found for an unknown id", async () => {
    const res = await refreshProposalLevels("nope", {
      dataDir: dir,
      fetchQuote: async () => 100,
      readSnapshot: async () => ({ equity: 10_000 }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not-found");
  });
});
