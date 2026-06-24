import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";
import {
  buildProsecutorPrompt,
  parseVerdict,
  redTeamOutcome,
  runRedTeam,
  type RedTeamExec,
} from "./red-team";
import { validateDataDir } from "./validate-data";
import { recordRejection, recordTradeDecision } from "./writers";

const proposal = {
  symbol: "NVDA",
  action: "buy" as const,
  side: "long" as const,
  qty: 9,
  limitPrice: 121.5,
  stopPrice: 112.0,
  takeProfit: 145.0,
  thesis: "AI accelerator demand still outrunning supply.",
  reasoning: "Breakout retest with reward/risk over 2:1.",
};

describe("buildProsecutorPrompt", () => {
  it("frames a hostile, default-to-no prosecutor and asks for a JSON verdict", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toContain("NVDA");
    expect(prompt).toContain(proposal.thesis);
    expect(prompt).toMatch(/refute|prosecut/i);
    expect(prompt).toMatch(/default.*(no|reject)/i);
    expect(prompt).toMatch(/json/i);
    expect(prompt).toMatch(/verdict/i);
  });
});

describe("parseVerdict", () => {
  it("parses a bare JSON object", () => {
    const v = parseVerdict('{"verdict":"reject","notes":"Valuation too rich."}');
    expect(v).toEqual({ verdict: "reject", notes: "Valuation too rich." });
  });

  it("extracts JSON from a markdown code fence", () => {
    const raw = "```json\n{\"verdict\":\"approve\",\"notes\":\"Holds up.\"}\n```";
    expect(parseVerdict(raw).verdict).toBe("approve");
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const raw =
      'My analysis follows.\n{"verdict":"concern","notes":"Event risk."}\nThat is all.';
    expect(parseVerdict(raw).verdict).toBe("concern");
  });

  it("normalizes a plain-language no/yes to reject/approve", () => {
    expect(parseVerdict('{"verdict":"no","notes":"x"}').verdict).toBe("reject");
    expect(parseVerdict('{"verdict":"YES","notes":"x"}').verdict).toBe(
      "approve",
    );
  });

  it("throws when there is no parseable verdict", () => {
    expect(() => parseVerdict("I cannot decide.")).toThrow();
  });
});

describe("redTeamOutcome", () => {
  it("maps verdicts to gate outcomes", () => {
    expect(redTeamOutcome({ verdict: "reject", notes: "x" })).toBe("block");
    expect(redTeamOutcome({ verdict: "concern", notes: "x" })).toBe("downsize");
    expect(redTeamOutcome({ verdict: "approve", notes: "x" })).toBe("allow");
  });
});

describe("runRedTeam", () => {
  it("returns the prosecutor's verdict", async () => {
    const exec: RedTeamExec = async () =>
      '{"verdict":"reject","notes":"Thesis leans on consensus."}';
    const v = await runRedTeam(proposal, { exec });
    expect(v).toEqual({
      verdict: "reject",
      notes: "Thesis leans on consensus.",
    });
  });

  it("fails CLOSED to a reject when the prosecutor errors", async () => {
    const exec: RedTeamExec = async () => {
      throw new Error("codex not found");
    };
    const v = await runRedTeam(proposal, { exec });
    expect(v.verdict).toBe("reject");
    expect(v.notes).toMatch(/default/i);
  });

  it("fails CLOSED to a reject on unparseable output", async () => {
    const exec: RedTeamExec = async () => "no idea";
    expect((await runRedTeam(proposal, { exec })).verdict).toBe("reject");
  });
});

describe("integration: gate → journal", () => {
  it("journals a blocked trade as a rejection with the prosecutor's reasoning", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-redteam-"));
    const exec: RedTeamExec = async () =>
      '{"verdict":"reject","notes":"Crowded long; stop too wide for the catalyst."}';
    const verdict = await runRedTeam(proposal, { exec });
    expect(redTeamOutcome(verdict)).toBe("block");

    const { file } = await recordRejection(
      {
        timestamp: "2026-06-24T09:36:00-04:00",
        symbol: proposal.symbol,
        proposedAction: "buy",
        rejectedBy: "codex-redteam",
        reviewDate: "2026-07-24",
        thesis: proposal.thesis,
        redTeam: verdict.notes,
        reason: verdict.notes,
      },
      { dataDir: dir },
    );

    expect(await validateDataDir(dir)).toEqual([]);
    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({
      kind: "rejection",
      rejectedBy: "codex-redteam",
    });
    expect(body).toContain("Crowded long");
  });

  it("records the verdict on an approved trade's journal entry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-redteam-"));
    const exec: RedTeamExec = async () =>
      '{"verdict":"approve","notes":"Trend and revisions support the entry."}';
    const verdict = await runRedTeam(proposal, { exec });
    expect(redTeamOutcome(verdict)).toBe("allow");

    const { file } = await recordTradeDecision(
      {
        timestamp: "2026-06-24T09:41:00-04:00",
        symbol: proposal.symbol,
        action: "buy",
        qty: proposal.qty,
        price: proposal.limitPrice,
        stopPrice: proposal.stopPrice,
        takeProfit: proposal.takeProfit,
        reviewDate: "2026-07-24",
        thesis: proposal.thesis,
        redTeam: verdict.notes,
        decision: "Placed the paper order.",
      },
      { dataDir: dir },
    );

    const { body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(body).toContain("**Red-team.** Trend and revisions support the entry.");
  });
});
