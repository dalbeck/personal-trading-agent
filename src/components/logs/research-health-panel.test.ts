import { describe, expect, it } from "vitest";
import { formatDiagnosticLine } from "./research-health-panel";

describe("formatDiagnosticLine", () => {
  it("renders ok with latency and includes the provider (fundamentals-fallback-fmp M2)", () => {
    const line = formatDiagnosticLine({
      at: "2026-06-27T12:00:00.000Z",
      provider: "perplexity",
      symbol: "LLY",
      outcome: "ok",
      latencyMs: 1200,
      cost: 0.012,
    });
    expect(line).toContain("LLY");
    expect(line).toContain("perplexity");
  });
  it("renders a failure with its reason and includes the provider", () => {
    const line = formatDiagnosticLine({
      at: "2026-06-27T12:00:00.000Z",
      provider: "perplexity",
      symbol: "LLY",
      outcome: "http-error",
      httpStatus: 402,
      latencyMs: 30,
    });
    expect(line).toContain("HTTP 402 (check API billing)");
    expect(line).toContain("perplexity");
  });
  it("surfaces the fmp provider label in the health line (fundamentals-fallback-fmp M2)", () => {
    const line = formatDiagnosticLine({
      at: "2026-06-27T12:00:00.000Z",
      provider: "fmp",
      symbol: "AAPL",
      outcome: "ok",
      latencyMs: 800,
    });
    expect(line).toContain("fmp");
    expect(line).toContain("AAPL");
    expect(line).toContain("800ms");
  });
});
