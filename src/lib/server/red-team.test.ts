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

  it("penalizes a fundamental/valuation-primary thesis and flags analyst-price targets", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toMatch(/technical/i);
    expect(prompt).toMatch(/out of mandate|penaliz/i);
    expect(prompt).toMatch(/fundamental|valuation/i);
    expect(prompt).toMatch(/analyst_price|analyst price/i);
  });

  it("weighs relative volume and flags a missing/none catalyst", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toMatch(/relative volume/i);
    expect(prompt).toMatch(/above-average/i);
    expect(prompt).toMatch(/catalyst/i);
    expect(prompt).toMatch(/why now/i);
  });

  it("renders catalyst details when present", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      relativeVolume: 1.45,
      catalyst: "Q3 beat-and-raise",
      catalystType: "earnings_momentum",
    });
    expect(prompt).toContain("1.45x avg");
    expect(prompt).toContain("Q3 beat-and-raise");
    expect(prompt).toContain("earnings_momentum");
  });
});

describe("parseVerdict", () => {
  it("parses a bare JSON object (back-compat: empty factors, null basis)", () => {
    const v = parseVerdict('{"verdict":"reject","notes":"Valuation too rich."}');
    expect(v).toEqual({
      verdict: "reject",
      notes: "Valuation too rich.",
      factors: [],
      basis: null,
    });
  });

  it("parses structured factors + a basis line", () => {
    const raw = JSON.stringify({
      verdict: "concern",
      notes: "Stop is too wide for the catalyst.",
      factors: [
        { label: "Entry", assessment: "Chasing an extended breakout.", stance: "refutes" },
        { label: "Edge", assessment: "Revisions still positive.", stance: "supports" },
        { label: "Stop", assessment: "2x ATR is loose.", stance: "neutral" },
      ],
      basis: "Trade only at half size.",
    });
    const v = parseVerdict(raw);
    expect(v.verdict).toBe("concern");
    expect(v.basis).toBe("Trade only at half size.");
    expect(v.factors).toHaveLength(3);
    expect(v.factors[0]).toEqual({
      label: "Entry",
      assessment: "Chasing an extended breakout.",
      stance: "refutes",
    });
    expect(v.factors[1].stance).toBe("supports");
  });

  it("drops malformed factors and defaults an unknown stance to neutral", () => {
    const raw = JSON.stringify({
      verdict: "approve",
      notes: "Holds up.",
      factors: [
        { label: "Entry", assessment: "Clean retest." }, // no stance → neutral
        { label: "", assessment: "missing label" }, // dropped
        { label: "Stop", assessment: "" }, // dropped
        { label: "Edge", assessment: "Strong RS.", stance: "bogus" }, // → neutral
      ],
    });
    const v = parseVerdict(raw);
    expect(v.factors).toHaveLength(2);
    expect(v.factors[0].stance).toBe("neutral");
    expect(v.factors[1]).toEqual({
      label: "Edge",
      assessment: "Strong RS.",
      stance: "neutral",
    });
    expect(v.basis).toBeNull();
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
    const base = { factors: [], basis: null };
    expect(redTeamOutcome({ verdict: "reject", notes: "x", ...base })).toBe("block");
    expect(redTeamOutcome({ verdict: "concern", notes: "x", ...base })).toBe("downsize");
    expect(redTeamOutcome({ verdict: "approve", notes: "x", ...base })).toBe("allow");
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
      factors: [],
      basis: null,
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
