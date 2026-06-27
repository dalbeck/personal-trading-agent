// src/lib/server/research/perplexity.test.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPerplexityProvider } from "./perplexity";
import { readResearchDiagnostics } from "./diagnostics";

let dir: string;
const clock = () => new Date("2026-06-27T12:00:00.000Z");

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pplx-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createPerplexityProvider diagnostics", () => {
  it("records no-api-key and returns null when the key is missing", async () => {
    const p = createPerplexityProvider({ apiKey: "", dataDir: dir, now: clock });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("no-api-key");
    expect((await readResearchDiagnostics({ dataDir: dir }))[0].outcome).toBe(
      "no-api-key",
    );
  });

  it("records http-error with status + body snippet on a non-200", async () => {
    const fetchImpl = (async () =>
      new Response("Payment Required: add credits", { status: 402 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    const d = p.lastDiagnostic?.();
    expect(d?.outcome).toBe("http-error");
    expect(d?.httpStatus).toBe(402);
    expect(d?.bodySnippet).toContain("Payment Required");
  });

  it("records timeout when the fetch aborts via TimeoutError", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("timeout");
  });

  it("records network-error on a generic fetch throw", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("network-error");
  });

  it("records daily-cap-reached when the cap is hit", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
      dailyCap: 0,
    });
    expect(await p.research({ symbol: "LLY" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("daily-cap-reached");
  });

  it("records ok with latency on a 200", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ output: [] }), { status: 200 })) as unknown as typeof fetch;
    const p = createPerplexityProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });
    expect(await p.research({ symbol: "LLY" })).not.toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("ok");
  });
});
