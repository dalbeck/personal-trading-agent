import { describe, expect, it } from "vitest";
import { formatDiagnosticLine } from "./research-health-panel";

describe("formatDiagnosticLine", () => {
  it("renders ok with latency", () => {
    expect(
      formatDiagnosticLine({
        at: "2026-06-27T12:00:00.000Z",
        provider: "perplexity",
        symbol: "LLY",
        outcome: "ok",
        latencyMs: 1200,
        cost: 0.012,
      }),
    ).toContain("LLY");
  });
  it("renders a failure with its reason", () => {
    expect(
      formatDiagnosticLine({
        at: "2026-06-27T12:00:00.000Z",
        provider: "perplexity",
        symbol: "LLY",
        outcome: "http-error",
        httpStatus: 402,
        latencyMs: 30,
      }),
    ).toContain("HTTP 402 (check API billing)");
  });
});
