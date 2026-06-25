import { describe, expect, it } from "vitest";
import { buildFinanceSections, sectionKind, stripScaffolding } from "./sections";
import type { ResearchFinanceResult } from "./types";

describe("stripScaffolding", () => {
  it("drops a multi-line field guide up to the next blank line", () => {
    const content = [
      "Quote field guide:",
      "- price: last trade price",
      "- mktCap: market capitalization",
      "",
      "| Metric | Value |",
      "| --- | --- |",
      "| Revenue (TTM) | $245B |",
    ].join("\n");
    const out = stripScaffolding(content);
    expect(out).not.toMatch(/field guide/i);
    expect(out).not.toContain("last trade price");
    expect(out).toContain("| Revenue (TTM) | $245B |");
  });

  it("removes column legends, row-key notes, and CSV references", () => {
    const content = [
      "| EPS | Est | Actual |",
      "| --- | --- | --- |",
      "| Q1 | 1.10 | 1.20 |",
      "Column legend: EPS = earnings per share, Est = consensus estimate",
      "Row key: each row is one fiscal quarter",
      "Data available in: NVDA_earnings_2026.csv",
      "See also NVDA_quotes_2026Q1.csv for tick data",
    ].join("\n");
    const out = stripScaffolding(content);
    expect(out).toContain("| Q1 | 1.10 | 1.20 |");
    expect(out).not.toMatch(/legend/i);
    expect(out).not.toMatch(/row key/i);
    expect(out).not.toMatch(/data available in/i);
    expect(out).not.toMatch(/\.csv/i);
  });

  it("returns an empty string when the block is pure scaffolding", () => {
    const content = [
      "Quote field guide:",
      "- price: last trade price",
      "Data available in: AAPL_quotes.csv",
    ].join("\n");
    expect(stripScaffolding(content)).toBe("");
    expect(stripScaffolding("")).toBe("");
  });
});

describe("sectionKind", () => {
  it("classifies by category tag", () => {
    expect(sectionKind(["earnings"], "")).toBe("earnings");
    expect(sectionKind(["transcript"], "")).toBe("transcript");
    expect(sectionKind(["income_statement"], "")).toBe("financials");
    expect(sectionKind(["profile"], "")).toBe("profile");
    expect(sectionKind(["quote"], "")).toBe("quote");
    expect(sectionKind(["misc"], "nothing recognizable")).toBe("other");
  });
});

describe("buildFinanceSections", () => {
  const blocks: ResearchFinanceResult[] = [
    {
      categories: ["earnings"],
      tickers: ["NVDA"],
      content: [
        "| Quarter | Actual | Est |",
        "| --- | --- | --- |",
        "| Q1 FY26 | 1.20 | 1.10 |",
        "Column legend: Actual = reported EPS",
        "Data available in: NVDA_earnings_2026.csv",
      ].join("\n"),
      sources: [{ title: "10-Q", url: "https://src.test/q" }],
    },
    {
      // Pure scaffolding → must be dropped (no empty header in the UI).
      categories: ["quote"],
      tickers: ["NVDA"],
      content: ["Quote field guide:", "- price: last trade"].join("\n"),
      sources: [],
    },
  ];

  it("produces typed sections with scaffolding stripped and empty blocks dropped", () => {
    const sections = buildFinanceSections(blocks);
    expect(sections).toHaveLength(1);
    const [earnings] = sections;
    expect(earnings.kind).toBe("earnings");
    expect(earnings.title).toBe("Earnings history");
    expect(earnings.content).toContain("| Q1 FY26 | 1.20 | 1.10 |");
    expect(earnings.content).not.toMatch(/legend/i);
    expect(earnings.content).not.toMatch(/\.csv/i);
    expect(earnings.sources).toHaveLength(1);
  });

  it("returns [] for no blocks", () => {
    expect(buildFinanceSections([])).toEqual([]);
  });
});
