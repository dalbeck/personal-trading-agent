import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

function req(): Request {
  return new Request("http://127.0.0.1:3000/api/symbol/NVDA/highlights", {
    method: "POST",
    headers: { host: "127.0.0.1:3000" },
  });
}

function ctx(ticker: string): { params: Promise<{ ticker: string }> } {
  return { params: Promise.resolve({ ticker }) };
}

const prevProvider = process.env.RESEARCH_PROVIDER;

beforeEach(() => {
  delete process.env.RESEARCH_PROVIDER; // default-off
});
afterEach(() => {
  if (prevProvider === undefined) delete process.env.RESEARCH_PROVIDER;
  else process.env.RESEARCH_PROVIDER = prevProvider;
});

describe("symbol highlights route", () => {
  it("rejects an invalid symbol with 400 (no provider call)", async () => {
    const res = await POST(req(), ctx("@bad!"));
    expect(res.status).toBe(400);
  });

  it("uppercases the symbol and reports the off state by default", async () => {
    const res = await POST(req(), ctx("nvda"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ off: true, capped: false, result: null });
  });
});
