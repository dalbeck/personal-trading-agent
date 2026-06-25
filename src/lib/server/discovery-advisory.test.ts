import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADVISORY_TAG, isAdvisoryProposal } from "@/lib/proposal-advisory";
import { TradeProposalSchema } from "@/lib/schemas";
import { recordAdvisoryProposal } from "./writers";

/**
 * Autonomous discovery (M3) may surface NEW ideas for the LIVE book — but those
 * are advisory-only and must have NO execution path. The single entry to order
 * routing (`POST /api/live/approve` → submitTradeApproval) refuses any proposal
 * for which `isAdvisoryProposal` is true, before any broker/sink call. So the
 * invariant to prove here is: every discovered LIVE idea is written advisory
 * (account: "live", advisory: true) and is therefore unreachable by execution.
 */
describe("discovery — live ideas are advisory-only (no execution path)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "discovery-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const idea = {
    id: "disc-2026-06-25-amd",
    createdAt: "2026-06-25T08:30:00-04:00",
    symbol: "AMD",
    action: "buy" as const,
    qty: 3,
    limitPrice: 168.5,
    stopPrice: 155,
    takeProfit: 195,
    riskPct: 0.018,
    thesis: "Discovered: AI accelerator momentum + relative strength breakout.",
    reasoning: "Scanned the universe + news; trend, RS, and a near catalyst.",
  };

  it("writes a discovered live idea as advisory + pending + account:live", async () => {
    const { file } = await recordAdvisoryProposal(idea, { dataDir: dir });
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    expect(p.account).toBe("live");
    expect(p.advisory).toBe(true);
    expect(p.status).toBe("pending");
    // The only execution entry refuses any advisory proposal → unreachable.
    expect(isAdvisoryProposal(p)).toBe(true);
  });

  it("tags it execute-manually", () => {
    expect(ADVISORY_TAG).toMatch(/advisory/i);
    expect(ADVISORY_TAG).toMatch(/manual/i);
  });

  it("a paper discovery idea is NOT advisory (flows the normal paper pipeline)", () => {
    expect(isAdvisoryProposal({ account: "paper", advisory: false })).toBe(false);
  });
});
