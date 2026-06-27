import { describe, expect, it } from "vitest";
import {
  EXPORT_DISCLAIMER,
  buildProposalPdfDocDefinition,
  exportFilenameBase,
  proposalToMarkdown,
} from "./proposal-export";
import { parseFrontmatter } from "@/lib/server/frontmatter";
import { buildStagedEntryPlan } from "./staged-entry";
import { TradeProposalSchema } from "./schemas";
import type { RedTeamVerdict, TradeProposal } from "./types";

const verdict: RedTeamVerdict = {
  verdict: "reject",
  notes: "Counter-trend with deteriorating fundamentals.",
  factors: [
    { label: "Edge", assessment: "Margins compressing", stance: "refutes" },
    { label: "Stop", assessment: "Below support", stance: "supports" },
  ],
  basis: "Defaulted to no on a weak value case.",
};

function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return TradeProposalSchema.parse({
    id: "manual-2026-06-26-KR",
    createdAt: "2026-06-26T18:28:30.056Z",
    symbol: "KR",
    action: "buy",
    side: "long",
    strategy: "value",
    qty: 12,
    limitPrice: 50,
    stopPrice: 46,
    takeProfit: 60,
    targetType: "fundamental",
    sector: "Consumer Staples",
    relativeVolume: 0.9,
    catalyst: "Dividend hike + insider buying near a multi-year low",
    catalystType: "guidance",
    convictionScore: 0.55,
    convictionTier: "moderate",
    riskPct: 0.015,
    thesis: "Quality grocer at a multi-year-low valuation with a dividend floor.",
    reasoning: "Mean-reversion entry below support; fundamentals stabilizing.",
    redTeam: verdict,
    ...overrides,
  });
}

const opts = { generatedAt: "2026-06-26T20:00:00.000Z" };

describe("exportFilenameBase", () => {
  it("is a stable proposal-<symbol>-<date> base", () => {
    expect(exportFilenameBase(makeProposal())).toBe("proposal-KR-2026-06-26");
  });
});

describe("proposalToMarkdown", () => {
  const md = proposalToMarkdown(makeProposal(), opts);

  it("emits valid frontmatter with the spec'd keys + per-lens verdicts", () => {
    const { data: frontmatter } = parseFrontmatter(md);
    expect(frontmatter.id).toBe("manual-2026-06-26-KR");
    expect(frontmatter.symbol).toBe("KR");
    expect(frontmatter.side).toBe("long");
    expect(frontmatter.strategy).toBe("value");
    expect(frontmatter.createdAt).toBe("2026-06-26T18:28:30.056Z");
    expect(frontmatter.convictionTier).toBe("moderate");
    expect(frontmatter.verdicts).toEqual({ value: "reject" });
  });

  it("includes every section of the full context", () => {
    expect(md).toContain("## Thesis");
    expect(md).toContain("## Technicals");
    expect(md).toContain("## Checklist — Value mandate");
    expect(md).toContain("## Sizing math");
    expect(md).toContain("## Research");
    expect(md).toContain("## Red-team reasoning — Value mandate");
  });

  it("renders the thesis, catalyst, and the red-team factors", () => {
    expect(md).toContain("multi-year-low valuation");
    expect(md).toContain("Dividend hike + insider buying");
    expect(md).toContain("Counter-trend with deteriorating fundamentals.");
    expect(md).toContain("**Edge** (refutes): Margins compressing");
  });

  it("uses the value checklist labels (mean-reversion framing)", () => {
    expect(md).toContain("Mean-reversion stop below support");
    expect(md).not.toContain("Volume confirms"); // trend-only item
  });

  it("ends with the snapshot timestamp + disclaimer footer", () => {
    expect(md).toContain("Snapshot: 2026-06-26T18:28:30.056Z");
    expect(md).toContain("Exported: 2026-06-26T20:00:00.000Z");
    expect(md).toContain(EXPORT_DISCLAIMER);
  });

  it("is deterministic for a given input", () => {
    expect(proposalToMarkdown(makeProposal(), opts)).toBe(md);
  });

  it("omits the staged-entry section when there is no plan", () => {
    expect(md).not.toContain("## Staged entry");
  });

  it("renders the staged-entry tranche table when a plan is attached", () => {
    const staged = proposalToMarkdown(
      makeProposal({
        stagedPlan: buildStagedEntryPlan({ fullQty: 9, trancheCount: 3 }),
      }),
      opts,
    );
    expect(staged).toContain("## Staged entry (DCA / scale-in)");
    expect(staged).toContain("| Tranche | Size | When & condition | Status |");
    expect(staged).toContain("1/3");
    expect(staged).toContain("Enter now");
    expect(staged).toMatch(/risk is sized on the \*\*full\*\* position/i);
  });

  it("handles a trend proposal (trend checklist + no value framing)", () => {
    const trendMd = proposalToMarkdown(
      makeProposal({ strategy: "trend" }),
      opts,
    );
    expect(trendMd).toContain("## Checklist — Trend mandate");
    expect(trendMd).toContain("Volume confirms");
    const { data: frontmatter } = parseFrontmatter(trendMd);
    expect(frontmatter.verdicts).toEqual({ trend: "reject" });
  });

  it("reads an unjudged proposal's verdict as 'not run'", () => {
    const md2 = proposalToMarkdown(makeProposal({ redTeam: null }), opts);
    const { data: frontmatter } = parseFrontmatter(md2);
    expect(frontmatter.verdicts).toEqual({ value: "not run" });
    expect(md2).toContain("has not judged this lens yet");
  });
});

describe("buildProposalPdfDocDefinition", () => {
  const doc = buildProposalPdfDocDefinition(makeProposal(), opts);

  it("carries a deterministic creation date from the export stamp", () => {
    expect(doc.info?.creationDate).toEqual(new Date(opts.generatedAt));
    expect(doc.pageSize).toBe("LETTER");
  });

  it("includes the staged-entry section in the PDF when a plan is attached", () => {
    const staged = buildProposalPdfDocDefinition(
      makeProposal({
        stagedPlan: buildStagedEntryPlan({ fullQty: 9, trancheCount: 3 }),
      }),
      opts,
    );
    const flat = JSON.stringify(staged.content);
    expect(flat).toContain("Staged entry (DCA / scale-in)");
    expect(flat).toContain("When & condition");
  });

  it("includes the section headings + the snapshot/disclaimer footer", () => {
    const flat = JSON.stringify(doc.content);
    expect(flat).toContain("Thesis");
    expect(flat).toContain("Technicals");
    expect(flat).toContain("Checklist — Value mandate");
    expect(flat).toContain("Sizing math");
    expect(flat).toContain("Red-team reasoning — Value mandate");
    // Footer is a function — invoke it the way pdfmake does.
    const footer = doc.footer as (c: number, t: number) => { text: string };
    expect(footer(1, 1).text).toContain(EXPORT_DISCLAIMER);
    expect(footer(1, 1).text).toContain("Snapshot: 2026-06-26T18:28:30.056Z");
  });
});
