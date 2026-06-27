import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";
import { validateDataDir } from "./validate-data";
import { mkdir } from "node:fs/promises";
import {
  markTrancheFilled,
  promoteLessonToPlaybook,
  readProposalById,
  recordAdvisoryProposal,
  recordCoaching,
  recordRejection,
  recordRiskRejection,
  recordRunLog,
  recordSnapshot,
  recordTradeDecision,
  setStagedPlan,
} from "./writers";
import { buildStagedEntryPlan } from "@/lib/staged-entry";
import { TradeProposalSchema } from "@/lib/schemas";

let dataDir = "";
let strategyDir = "";

afterEach(() => {
  dataDir = "";
  strategyDir = "";
});

async function tmpData(): Promise<string> {
  dataDir = await mkdtemp(path.join(tmpdir(), "pta-writers-data-"));
  return dataDir;
}

async function tmpStrategy(playbook: string): Promise<string> {
  strategyDir = await mkdtemp(path.join(tmpdir(), "pta-writers-strat-"));
  await writeFile(path.join(strategyDir, "playbook.md"), playbook);
  return strategyDir;
}

const tradeInput = {
  timestamp: "2026-06-24T09:41:00-04:00",
  symbol: "NVDA",
  action: "buy" as const,
  side: "long" as const,
  qty: 9,
  price: 121.5,
  stopPrice: 112.0,
  takeProfit: 145.0,
  riskPct: 0.0085,
  reviewDate: "2026-07-24",
  tags: ["semis", "trend"],
  thesis: "AI accelerator demand still outrunning supply.",
  research: "Datacenter backlog extending; hyperscaler capex raised.",
  redTeam: "Valuation rich, but trend and earnings revisions support it.",
  decision: "Bought 9 shares with a stop under the breakout pivot.",
};

describe("recordTradeDecision", () => {
  it("writes a well-formed, schema-valid trade entry", async () => {
    const dir = await tmpData();
    const { id, file } = await recordTradeDecision(tradeInput, { dataDir: dir });

    expect(id).toBe("j-2026-06-24-nvda");
    expect(await validateDataDir(dir)).toEqual([]);

    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({ kind: "trade", symbol: "NVDA", qty: 9 });
    expect(body).toContain("AI accelerator demand");
    expect(body).toContain("**Research.**");
    expect(body).toContain("**Decision.**");
  });

  it("does not clobber a same-day, same-symbol entry", async () => {
    const dir = await tmpData();
    const a = await recordTradeDecision(tradeInput, { dataDir: dir });
    const b = await recordTradeDecision(tradeInput, { dataDir: dir });
    expect(a.file).not.toBe(b.file);
    expect(await validateDataDir(dir)).toEqual([]);
  });
});

describe("recordRejection", () => {
  it("writes a schema-valid rejection entry", async () => {
    const dir = await tmpData();
    const { file } = await recordRejection(
      {
        timestamp: "2026-06-24T09:33:00-04:00",
        symbol: "TSLA",
        proposedAction: "buy",
        rejectedBy: "codex-redteam",
        reviewDate: "2026-07-02",
        tags: ["event-risk"],
        thesis: "Delivery-beat momentum.",
        reason: "Binary print into elevated IV; default-to-no held.",
      },
      { dataDir: dir },
    );
    expect(await validateDataDir(dir)).toEqual([]);
    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({
      kind: "rejection",
      rejectedBy: "codex-redteam",
    });
    expect(body).toContain("**Rejected.**");
  });
});

describe("recordRiskRejection", () => {
  it("journals a risk-engine block with the violations as the reason", async () => {
    const dir = await tmpData();
    const { file } = await recordRiskRejection(
      {
        timestamp: "2026-06-24T09:36:00-04:00",
        symbol: "SMCI",
        proposedAction: "buy",
        reviewDate: "2026-07-06",
        thesis: "Server-build momentum.",
      },
      {
        ok: false,
        violations: [
          { rule: "position-size", message: "size $30,000 exceeds 20%" },
        ],
      },
      { dataDir: dir },
    );
    expect(await validateDataDir(dir)).toEqual([]);
    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({ kind: "rejection", rejectedBy: "rules" });
    expect(body).toContain("Blocked by the risk engine");
    expect(body).toContain("position-size");
  });
});

describe("recordCoaching", () => {
  it("writes a schema-valid coaching entry", async () => {
    const dir = await tmpData();
    const { id, file } = await recordCoaching(
      {
        date: "2026-06-24",
        period: "weekly",
        symbol: "AMD",
        relatedJournalIds: ["j-2026-06-09-amd"],
        grade: "B",
        expected: "Track SPY with lower drawdown.",
        actual: "Outperformed by 150bps.",
        lesson: "Pullback entries beat breakout chases.",
      },
      { dataDir: dir },
    );
    expect(id).toBe("c-2026-06-24");
    expect(await validateDataDir(dir)).toEqual([]);
    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({ grade: "B", promotedToPlaybook: false });
    expect(body).toContain("**Lesson.**");
  });
});

describe("recordRunLog", () => {
  it("writes a schema-valid run log", async () => {
    const dir = await tmpData();
    const { file } = await recordRunLog(
      {
        routine: "market-open-execution",
        startedAt: "2026-06-24T09:35:00-04:00",
        finishedAt: "2026-06-24T09:35:42-04:00",
        status: "ok",
        summary: "Placed 1 order, rejected 1.",
        proposalsConsidered: 2,
        ordersPlaced: 1,
        rejections: 1,
      },
      { dataDir: dir },
    );
    expect(file).toMatch(/logs\/.*market-open-execution\.json$/);
    expect(await validateDataDir(dir)).toEqual([]);
  });
});

describe("recordSnapshot", () => {
  it("writes a schema-valid snapshot named by date", async () => {
    const dir = await tmpData();
    const { file } = await recordSnapshot(
      {
        account: "paper",
        asOf: "2026-06-24T16:15:00-04:00",
        currency: "USD",
        equity: 100_000,
        cash: 50_000,
        buyingPower: 100_000,
        totalPl: 0,
        totalPlPct: 0,
        dayPl: 0,
        dayPlPct: 0,
        positions: [],
        equityCurve: [],
      },
      { dataDir: dir },
    );
    expect(file).toMatch(/snapshots\/2026-06-24\.json$/);
    expect(await validateDataDir(dir)).toEqual([]);
  });
});

describe("promoteLessonToPlaybook", () => {
  const playbook = [
    "# Playbook",
    "",
    "## Banked lessons",
    "",
    "Durable lessons promoted from the coaching log. Newest first.",
    "",
    "- **Existing.** Old lesson.",
    "",
  ].join("\n");

  it("prepends the lesson with provenance under Banked lessons", async () => {
    const dir = await tmpStrategy(playbook);
    await promoteLessonToPlaybook(
      {
        lesson: "Honor the trim trigger on losers.",
        date: "2026-06-24",
        sourceId: "c-2026-06-24",
      },
      { strategyDir: dir },
    );
    const out = await readFile(path.join(dir, "playbook.md"), "utf8");
    expect(out).toContain(
      "- Honor the trim trigger on losers. _(Promoted 2026-06-24, from c-2026-06-24.)_",
    );
    expect(out.indexOf("Honor the trim trigger")).toBeLessThan(
      out.indexOf("Old lesson"),
    );
  });
});

describe("staged-entry plan writers (M2)", () => {
  /** Seed an approvable proposal file (qty 9) into the temp data dir. */
  async function seed(dir: string): Promise<void> {
    const p = TradeProposalSchema.parse({
      id: "manual-X-1",
      createdAt: "2026-06-26T20:00:00.000Z",
      symbol: "X",
      action: "buy",
      side: "long",
      qty: 9,
      limitPrice: 100,
      stopPrice: 92,
      takeProfit: 130,
      riskPct: 0.012,
      thesis: "t",
      reasoning: "r",
      status: "pending",
      account: "live",
      advisory: false,
      origin: "manual-request",
    });
    await mkdir(path.join(dir, "proposals"), { recursive: true });
    await writeFile(
      path.join(dir, "proposals", "manual-X-1.json"),
      JSON.stringify(p),
    );
  }

  it("attaches and clears a staged plan in place", async () => {
    const dir = await tmpData();
    await seed(dir);
    const plan = buildStagedEntryPlan({ fullQty: 9, trancheCount: 3 })!;

    const attached = await setStagedPlan("manual-X-1", plan, { dataDir: dir });
    expect(attached?.stagedPlan?.tranches).toHaveLength(3);
    const reread = await readProposalById("manual-X-1", { dataDir: dir });
    expect(reread?.stagedPlan?.tranches.map((t) => t.qty)).toEqual([3, 3, 3]);

    const cleared = await setStagedPlan("manual-X-1", null, { dataDir: dir });
    expect(cleared?.stagedPlan).toBeNull();
  });

  it("marks a tranche filled and flips to approved only when ALL are filled", async () => {
    const dir = await tmpData();
    await seed(dir);
    await setStagedPlan(
      "manual-X-1",
      buildStagedEntryPlan({ fullQty: 9, trancheCount: 3 }),
      { dataDir: dir },
    );

    const afterFirst = await markTrancheFilled("manual-X-1", 0, { dataDir: dir });
    expect(afterFirst?.stagedPlan?.tranches[0].status).toBe("filled");
    // More tranches pending → the proposal is NOT yet approved.
    expect(afterFirst?.status).toBe("pending");

    await markTrancheFilled("manual-X-1", 1, { dataDir: dir });
    const afterLast = await markTrancheFilled("manual-X-1", 2, { dataDir: dir });
    // Every tranche filled → the staged entry is complete.
    expect(afterLast?.stagedPlan?.tranches.every((t) => t.status === "filled")).toBe(true);
    expect(afterLast?.status).toBe("approved");
  });
});

describe("recordAdvisoryProposal", () => {
  const advInput = {
    id: "adv-2026-06-24-nvda",
    createdAt: "2026-06-24T10:00:00-04:00",
    symbol: "NVDA",
    action: "sell" as const,
    qty: 0.2,
    limitPrice: 148.0,
    riskPct: 0.004,
    thesis: "Trim the fractional NVDA into strength to lock a gain.",
    reasoning: "Position is up; advisory trim keeps risk within the live caps.",
  };

  it("stamps account=live, advisory=true, status=pending and validates", async () => {
    const dir = await tmpData();
    const { id, file } = await recordAdvisoryProposal(advInput, { dataDir: dir });
    expect(id).toBe("adv-2026-06-24-nvda");

    const written = TradeProposalSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    expect(written.account).toBe("live");
    expect(written.advisory).toBe(true);
    expect(written.status).toBe("pending");
    expect(written.symbol).toBe("NVDA");

    // The whole data dir still validates against the contracts.
    const problems = await validateDataDir(dir);
    expect(problems).toEqual([]);
  });

  it("cannot be coerced into a paper or pre-approved proposal", async () => {
    const dir = await tmpData();
    const { file } = await recordAdvisoryProposal(
      // Hostile caller trying to smuggle in paper/approved fields.
      { ...advInput, account: "paper", advisory: false, status: "approved" } as never,
      { dataDir: dir },
    );
    const written = TradeProposalSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    expect(written.account).toBe("live");
    expect(written.advisory).toBe(true);
    expect(written.status).toBe("pending");
  });
});
