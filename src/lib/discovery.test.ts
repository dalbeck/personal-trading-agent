import { describe, expect, it } from "vitest";
import {
  discoveryProposalBudget,
  selectDiscoveryCandidates,
  type DiscoveryCandidate,
} from "./discovery";

describe("selectDiscoveryCandidates", () => {
  // A synthetic multi-sector universe: 4 sectors, several names each, varied
  // scores. This is the spread/diversification fixture M1's acceptance asks for.
  const universe: DiscoveryCandidate[] = [
    { symbol: "NVDA", sector: "Information Technology", score: 0.95 },
    { symbol: "AMD", sector: "Information Technology", score: 0.9 },
    { symbol: "AVGO", sector: "Information Technology", score: 0.85 },
    { symbol: "MSFT", sector: "Information Technology", score: 0.8 },
    { symbol: "JPM", sector: "Financials", score: 0.7 },
    { symbol: "GS", sector: "Financials", score: 0.6 },
    { symbol: "XOM", sector: "Energy", score: 0.55 },
    { symbol: "UNH", sector: "Health Care", score: 0.5 },
  ];

  it("caps the number of candidates per sector", () => {
    const out = selectDiscoveryCandidates(universe, {
      ideaCap: 20,
      maxPerSector: 2,
    });
    const tech = out.filter((c) => c.sector === "Information Technology");
    expect(tech.length).toBe(2);
    // The two kept tech names are the strongest in that sector (best-in-sector).
    expect(tech.map((c) => c.symbol).sort()).toEqual(["AMD", "NVDA"]);
  });

  it("never exceeds the idea cap", () => {
    const out = selectDiscoveryCandidates(universe, {
      ideaCap: 3,
      maxPerSector: 3,
    });
    expect(out.length).toBe(3);
  });

  it("spreads across sectors rather than filling from one", () => {
    // With cap=2/sector and a generous idea cap, the result must touch every
    // sector that has a decent setup — provably not all one sector.
    const out = selectDiscoveryCandidates(universe, {
      ideaCap: 20,
      maxPerSector: 2,
    });
    const sectors = new Set(out.map((c) => c.sector));
    expect(sectors.size).toBe(4);
  });

  it("favours diversification before depth — every sector represented before any goes deep", () => {
    // idea cap of 4 with a per-sector cap of 3: a naive 'take strongest first'
    // would pick 3 tech + 1 financial. Best-in-sector SPREAD picks the top of
    // each of the 4 sectors first.
    const out = selectDiscoveryCandidates(universe, {
      ideaCap: 4,
      maxPerSector: 3,
    });
    expect(new Set(out.map((c) => c.sector)).size).toBe(4);
    expect(out.map((c) => c.symbol).sort()).toEqual([
      "JPM",
      "NVDA",
      "UNH",
      "XOM",
    ]);
  });

  it("treats unknown-sector names individually (no false per-sector cap)", () => {
    const out = selectDiscoveryCandidates(
      [
        { symbol: "AAA", sector: null, score: 0.9 },
        { symbol: "BBB", sector: null, score: 0.8 },
        { symbol: "CCC", sector: null, score: 0.7 },
      ],
      { ideaCap: 20, maxPerSector: 1 },
    );
    // An unknown sector can't be concentration-capped, so all three survive.
    expect(out.map((c) => c.symbol).sort()).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("returns an empty list for an empty universe", () => {
    expect(
      selectDiscoveryCandidates([], { ideaCap: 20, maxPerSector: 3 }),
    ).toEqual([]);
  });
});

describe("discoveryProposalBudget", () => {
  it("is the per-run cap minus pending proposals", () => {
    expect(discoveryProposalBudget(0, 6)).toBe(6);
    expect(discoveryProposalBudget(2, 6)).toBe(4);
    expect(discoveryProposalBudget(6, 6)).toBe(0);
  });

  it("never goes negative when already over the cap", () => {
    expect(discoveryProposalBudget(9, 6)).toBe(0);
  });

  it("clamps a negative pending count to zero", () => {
    expect(discoveryProposalBudget(-3, 6)).toBe(6);
  });
});
