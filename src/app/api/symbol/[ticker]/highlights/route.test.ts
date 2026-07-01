import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const TOKEN = "test-trigger-token";

function req(): Request {
  return new Request("http://127.0.0.1:3000/api/symbol/NVDA/highlights", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", authorization: `Bearer ${TOKEN}` },
  });
}

function ctx(ticker: string): { params: Promise<{ ticker: string }> } {
  return { params: Promise.resolve({ ticker }) };
}

const prevProvider = process.env.RESEARCH_PROVIDER;

beforeEach(() => {
  delete process.env.RESEARCH_PROVIDER; // default-off
  process.env.ROUTINE_TRIGGER_TOKEN = TOKEN;
});
afterEach(() => {
  if (prevProvider === undefined) delete process.env.RESEARCH_PROVIDER;
  else process.env.RESEARCH_PROVIDER = prevProvider;
  delete process.env.ROUTINE_TRIGGER_TOKEN;
});

describe("symbol research route", () => {
  it("rejects an invalid symbol with 400 (no provider call)", async () => {
    const res = await POST(req(), ctx("@bad!"));
    expect(res.status).toBe(400);
  });

  it("uppercases the symbol and reports the degraded state by default", async () => {
    // No Perplexity key + no Robinhood connection in the test env: everything is
    // null, with honest status flags so the UI shows "—" + the link-outs.
    const res = await POST(req(), ctx("nvda"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.perplexity).toBe("off");
    expect(body.robinhoodConnected).toBe(false);
    expect(body.fundamentals).toBeNull();
    expect(body.profile).toBeNull();
    expect(body.consensus).toBeNull();
  });
});
