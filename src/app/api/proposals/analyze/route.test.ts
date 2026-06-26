import { describe, expect, it } from "vitest";
import { POST } from "./route";

/**
 * The analyze route is a thin adapter over `analyzeSymbol` (covered by
 * `src/lib/server/analyze-symbol.test.ts`). These guard the input validation
 * that happens BEFORE any research/broker/CLI work — so they run without the
 * network or a metered call.
 */
describe("POST /api/proposals/analyze — input validation", () => {
  it("400s on a non-JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/proposals/analyze", {
      method: "POST",
      body: "not json",
    }));
    expect(res.status).toBe(400);
  });

  it("400s when no symbol is provided", async () => {
    const res = await POST(
      new Request("http://localhost/api/proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/symbol/i);
  });

  it("400s on a blank symbol", async () => {
    const res = await POST(
      new Request("http://localhost/api/proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: "   " }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
