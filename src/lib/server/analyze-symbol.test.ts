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

  it("defaults to the trend lens, briefing the red-team with the trend mandate", async () => {
    let prompt = "";
    const res = await analyzeSymbol("NVDA", {
      account: "live",
      dataDir: dir,
      fetchBars: async () => ramp(60, 50, 1),
      readSnapshot: snapshotSeam,
      fetchResearch: researchSeam,
      redTeamExec: async (p) => {
        prompt = p;
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.proposal.strategy).toBe("trend");
    expect(prompt).toMatch(/TREND mandate/);
  });

  it("analyzes under the VALUE lens: strategy: value persisted + value red-team briefing", async () => {
    let prompt = "";
    const res = await analyzeSymbol("KR", {
      account: "live",
      strategy: "value",
      dataDir: dir,
      fetchBars: async () => ramp(220, 160, -0.5), // a deep downtrend = the discount
      readSnapshot: snapshotSeam,
      fetchResearch: () =>
        Promise.resolve({
          sector: "Consumer Staples",
          catalyst: "Dividend support + insider buying near a multi-year low",
          catalystType: "guidance" as const,
          usedPerplexity: false,
        }),
      redTeamExec: async (p) => {
        prompt = p;
        return approveExec();
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The proposal carries the value mandate end-to-end.
    expect(res.proposal.strategy).toBe("value");
    // The red-team was briefed with the value lens, NOT the trend one — so a
    // below-MA counter-trend pick gets a fair hearing.
    expect(prompt).toMatch(/VALUE \/ MEAN-REVERSION/);
    expect(prompt).toMatch(/COUNTER-TREND IS EXPECTED/);
    expect(prompt).not.toMatch(/out of mandate/i);

    // Persisted to disk with strategy: value (validates against the contract).
    const files = await readdir(path.join(dir, "proposals"));
    const p = TradeProposalSchema.parse(
      JSON.parse(await readFile(path.join(dir, "proposals", files[0]), "utf8")),
    );
    expect(p.strategy).toBe("value");
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
