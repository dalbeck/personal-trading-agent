# Research Observability (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Perplexity research failure legible — capture the specific reason (no-api-key / provider-off / daily-cap-reached / http-`<status>` / timeout / parse-error / network-error), surface it on the symbol page and the proposal/export, raise the agent timeout 15s→35s, and add a research-provider health panel to the Logs page.

**Architecture:** A new `research/diagnostics.ts` defines a `ResearchDiagnostic` record + a persisted ring (`data/research/diagnostics.json`). The Perplexity provider builds one diagnostic on **every** call path, logs it, persists it (best-effort), and exposes the latest via a new optional `lastDiagnostic()` method on `ResearchProvider` — so `research()`'s `ResearchResult | null` signature is unchanged and no other caller breaks. `getSymbolResearch` reads `lastDiagnostic()` to derive a specific `perplexityReason` alongside the existing coarse `PerplexityStatus`, threads it into `SymbolResearch`, and the analyze pipeline persists it on the proposal as `researchStatusReason`. The Logs page reads the ring server-side.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Zod schemas, Vitest, Tailwind. Node 22 / pnpm 11.

## Global Constraints

- **Node 22.x / pnpm 11.9.0** — copied verbatim from `package.json`.
- **No AI attribution** anywhere — no `Co-Authored-By`, "Generated with", 🤖, or model names in commits/PRs/branches (`AGENTS.md` hard rules 1–2).
- **Feature branch only**, off `main`, merged via PR (`AGENTS.md` hard rule 3). Branch for this milestone: `feature/research-observability` (no `claude`/`ai`/`agent`/`bot`/model names).
- **Never commit secrets**; `.env` and `data/` stay gitignored (`AGENTS.md` hard rule 4).
- **Research is context-only** — never order pricing or execution (`.agents/infra.md`). This milestone touches only observability of the research fetch; it must not change gates, rails, the red-team's numeric behavior, or execution.
- **Self-correction mandate:** if a rule in `.agents/*.md` is wrong/outdated, fix it in the same change (`AGENTS.md`).
- **Test command:** `pnpm vitest run <file>` for one file; `pnpm test` for all. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- **Path alias:** `@/` → `src/` (used throughout, e.g. `@/lib/types`).
- **`server-only` modules:** any file importing `server-only` (e.g. `perplexity.ts`, `usage.ts`, `cache.ts`) must NOT be imported by client components. The new `diagnostics.ts` is server-only.

---

## File Structure

**Create:**
- `src/lib/server/research/diagnostics.ts` — diagnostic types, outcome enum, human-reason text, outcome→`PerplexityStatus` mapping, persisted ring (read/write). Server-only.
- `src/lib/server/research/diagnostics.test.ts` — unit tests for the pure mappers + the ring persistence.
- `src/components/logs/research-health-panel.tsx` — presentational panel rendering recent diagnostics (server component, plain props).

**Modify:**
- `src/lib/server/research/types.ts` — add `lastDiagnostic?()` to `ResearchProvider`; add `perplexityReason` to `SymbolResearch`.
- `src/lib/server/research/perplexity.ts` — raise timeout, build/log/persist a diagnostic on every path, expose `lastDiagnostic()`.
- `src/lib/server/research/perplexity.test.ts` — exists? (check) add per-failure-mode tests. If absent, create it.
- `src/lib/server/symbol-research.ts` — derive `perplexityReason` from `lastDiagnostic()`; pass it through `mergeSymbolResearch`.
- `src/lib/server/research/cache.ts` — bump `CACHE_VERSION` 7→8 (shape gained `perplexityReason`).
- `src/components/symbol/research-context.tsx` — `FALLBACK` gains `perplexityReason: null`; `perplexityNote(status, reason?)` prefers the specific reason.
- `src/components/symbol/analyst-consensus.tsx`, `research-summary-card.tsx`, `company-profile.tsx` — pass `research.perplexityReason` into `perplexityNote`.
- `src/lib/schemas.ts` — add `researchStatusReason` to `ProposalLensSchema` and the top-level proposal schema.
- `src/lib/server/analyze-symbol.ts` — thread `researchStatusReason` from research → lens + top-level proposal.
- `src/lib/proposal-lens.ts` — `singleLensFromTopLevel` carries `researchStatusReason`.
- `src/components/research-unavailable-notice.tsx` — accept an optional `reason` prop, prefer it over the generic label.
- `src/components/proposal-detail-view.tsx` — pass `lens.researchStatusReason` to the notice.
- `src/lib/proposal-export.ts` — append the specific research reason to the Research section when present.
- `src/app/logs/page.tsx` — read the ring and render `<ResearchHealthPanel />`.
- `.agents/infra.md` — document the diagnostics ring + the 35s timeout (self-correction mandate).

---

### Task 1: Diagnostics module — types, mappers, persisted ring

**Files:**
- Create: `src/lib/server/research/diagnostics.ts`
- Test: `src/lib/server/research/diagnostics.test.ts`

**Interfaces:**
- Consumes: `PerplexityStatus` from `./types`.
- Produces:
  - `type ResearchOutcome = "ok" | "no-api-key" | "provider-off" | "daily-cap-reached" | "http-error" | "timeout" | "parse-error" | "network-error"`
  - `interface ResearchDiagnostic { at: string; provider: string; symbol: string; outcome: ResearchOutcome; httpStatus?: number; bodySnippet?: string; latencyMs: number; cost?: number }`
  - `researchReasonText(d: ResearchDiagnostic): string | null` — human reason, `null` when `outcome === "ok"`.
  - `diagnosticToStatus(d: ResearchDiagnostic): PerplexityStatus`
  - `recordResearchDiagnostic(d: ResearchDiagnostic, opts?: { dataDir?: string }): Promise<void>` — prepend to `data/research/diagnostics.json`, cap 20, best-effort (never throws).
  - `readResearchDiagnostics(opts?: { dataDir?: string }): Promise<ResearchDiagnostic[]>` — newest-first; `[]` on miss/unreadable.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/server/research/diagnostics.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diagnosticToStatus,
  readResearchDiagnostics,
  recordResearchDiagnostic,
  researchReasonText,
  type ResearchDiagnostic,
} from "./diagnostics";

function diag(over: Partial<ResearchDiagnostic> = {}): ResearchDiagnostic {
  return {
    at: "2026-06-27T12:00:00.000Z",
    provider: "perplexity",
    symbol: "LLY",
    outcome: "ok",
    latencyMs: 1234,
    ...over,
  };
}

describe("researchReasonText", () => {
  it("returns null when ok", () => {
    expect(researchReasonText(diag({ outcome: "ok" }))).toBeNull();
  });
  it("names the HTTP status and flags billing for 402", () => {
    expect(
      researchReasonText(diag({ outcome: "http-error", httpStatus: 402 })),
    ).toBe("HTTP 402 (check API billing)");
  });
  it("names a non-billing HTTP status plainly", () => {
    expect(
      researchReasonText(diag({ outcome: "http-error", httpStatus: 503 })),
    ).toBe("HTTP 503");
  });
  it("describes a missing key, cap, timeout, parse and network", () => {
    expect(researchReasonText(diag({ outcome: "no-api-key" }))).toBe(
      "no API key configured",
    );
    expect(researchReasonText(diag({ outcome: "daily-cap-reached" }))).toBe(
      "daily research cap reached",
    );
    expect(researchReasonText(diag({ outcome: "timeout" }))).toBe(
      "timed out (35s)",
    );
    expect(researchReasonText(diag({ outcome: "parse-error" }))).toBe(
      "response parse error",
    );
    expect(researchReasonText(diag({ outcome: "network-error" }))).toBe(
      "network error",
    );
  });
});

describe("diagnosticToStatus", () => {
  it("maps outcomes to the coarse PerplexityStatus", () => {
    expect(diagnosticToStatus(diag({ outcome: "ok" }))).toBe("ok");
    expect(diagnosticToStatus(diag({ outcome: "provider-off" }))).toBe("off");
    expect(diagnosticToStatus(diag({ outcome: "daily-cap-reached" }))).toBe(
      "capped",
    );
    expect(diagnosticToStatus(diag({ outcome: "no-api-key" }))).toBe(
      "unavailable",
    );
    expect(
      diagnosticToStatus(diag({ outcome: "http-error", httpStatus: 402 })),
    ).toBe("unavailable");
    expect(diagnosticToStatus(diag({ outcome: "timeout" }))).toBe("unavailable");
  });
});

describe("ring persistence", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "diag-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns [] when nothing is recorded", async () => {
    expect(await readResearchDiagnostics({ dataDir: dir })).toEqual([]);
  });

  it("prepends newest-first and caps at 20", async () => {
    for (let i = 0; i < 25; i++) {
      await recordResearchDiagnostic(
        diag({ latencyMs: i, at: `2026-06-27T12:00:${String(i).padStart(2, "0")}.000Z` }),
        { dataDir: dir },
      );
    }
    const all = await readResearchDiagnostics({ dataDir: dir });
    expect(all).toHaveLength(20);
    expect(all[0].latencyMs).toBe(24); // newest first
    expect(all[19].latencyMs).toBe(5); // oldest kept
  });

  it("never throws on an unreadable file", async () => {
    await rm(dir, { recursive: true, force: true }); // dir gone
    await expect(
      recordResearchDiagnostic(diag(), { dataDir: dir }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/research/diagnostics.test.ts`
Expected: FAIL — cannot resolve `./diagnostics`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/server/research/diagnostics.ts
import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PerplexityStatus } from "./types";

/**
 * Research-call observability (research-observability M1). Every research call —
 * success or failure — produces one `ResearchDiagnostic` so a silent `null` is
 * never the only signal. The provider logs + persists it; the orchestrator turns
 * it into a specific, human reason for the UI; the Logs page renders the ring.
 *
 * Internal state file (like the usage counter / cache), NOT a `data/` artifact
 * contract — written by us, read best-effort. Unreadable → empty, never an error.
 */

export type ResearchOutcome =
  | "ok"
  | "no-api-key"
  | "provider-off"
  | "daily-cap-reached"
  | "http-error"
  | "timeout"
  | "parse-error"
  | "network-error";

export interface ResearchDiagnostic {
  /** RFC3339 timestamp the call resolved. */
  at: string;
  /** Provider name, e.g. "perplexity". */
  provider: string;
  symbol: string;
  outcome: ResearchOutcome;
  /** HTTP status for `http-error`. */
  httpStatus?: number;
  /** Short body snippet for `http-error` (first ~200 chars), for diagnosis. */
  bodySnippet?: string;
  latencyMs: number;
  /** Real per-call cost (USD) when the API reported it (ok path only). */
  cost?: number;
}

const RING_CAP = 20;

/** A short, specific human reason for the UI/export — null when the call was ok. */
export function researchReasonText(d: ResearchDiagnostic): string | null {
  switch (d.outcome) {
    case "ok":
      return null;
    case "no-api-key":
      return "no API key configured";
    case "provider-off":
      return "research off";
    case "daily-cap-reached":
      return "daily research cap reached";
    case "http-error": {
      const billing =
        d.httpStatus === 401 || d.httpStatus === 402 || d.httpStatus === 403
          ? " (check API billing)"
          : "";
      return `HTTP ${d.httpStatus ?? "error"}${billing}`;
    }
    case "timeout":
      return "timed out (35s)";
    case "parse-error":
      return "response parse error";
    case "network-error":
      return "network error";
  }
}

/** Coarse status for the existing `PerplexityStatus` field. */
export function diagnosticToStatus(d: ResearchDiagnostic): PerplexityStatus {
  switch (d.outcome) {
    case "ok":
      return "ok";
    case "provider-off":
      return "off";
    case "daily-cap-reached":
      return "capped";
    default:
      return "unavailable";
  }
}

function ringFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "research", "diagnostics.json");
}

/** Newest-first recent diagnostics; [] on miss/unreadable. */
export async function readResearchDiagnostics(opts?: {
  dataDir?: string;
}): Promise<ResearchDiagnostic[]> {
  try {
    const raw = await readFile(ringFile(opts?.dataDir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResearchDiagnostic[]) : [];
  } catch {
    return [];
  }
}

/** Prepend `d`, cap the ring, persist. Best-effort — never throws. */
export async function recordResearchDiagnostic(
  d: ResearchDiagnostic,
  opts?: { dataDir?: string },
): Promise<void> {
  try {
    const file = ringFile(opts?.dataDir);
    const prev = await readResearchDiagnostics(opts);
    const next = [d, ...prev].slice(0, RING_CAP);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    // Recording diagnostics must never break a research call.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/server/research/diagnostics.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/research/diagnostics.ts src/lib/server/research/diagnostics.test.ts
git commit -m "Add research diagnostics types, reason mapping, and persisted ring"
```

---

### Task 2: Perplexity provider — raise timeout, emit a diagnostic on every path

**Files:**
- Modify: `src/lib/server/research/types.ts` (add optional `lastDiagnostic`)
- Modify: `src/lib/server/research/perplexity.ts:39` (timeout) and the `research()` body
- Test: `src/lib/server/research/perplexity.test.ts` (create if missing)

**Interfaces:**
- Consumes: `ResearchDiagnostic`, `recordResearchDiagnostic` from `./diagnostics`.
- Produces: provider object now also implements `lastDiagnostic(): ResearchDiagnostic | null`. `research()` signature unchanged (`Promise<ResearchResult | null>`).

- [ ] **Step 1: Add the optional method to the interface**

In `src/lib/server/research/types.ts`, change the `ResearchProvider` interface (around line 142):

```ts
export interface ResearchProvider {
  readonly name: string;
  /** Returns context, or `null` when off / capped / unavailable. Never throws. */
  research(query: ResearchQuery): Promise<ResearchResult | null>;
  /** The diagnostic for the most recent `research()` call on this instance, or
   *  null if it has not been called. Lets the orchestrator surface a specific
   *  failure reason without changing `research()`'s return contract. */
  lastDiagnostic?(): import("./diagnostics").ResearchDiagnostic | null;
}
```

- [ ] **Step 2: Write the failing tests**

Check first: `test -f src/lib/server/research/perplexity.test.ts`. If it exists, append these `describe` blocks; otherwise create the file with this content.

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/server/research/perplexity.test.ts`
Expected: FAIL — `lastDiagnostic` not implemented / diagnostics not recorded.

- [ ] **Step 4: Implement the provider changes**

In `src/lib/server/research/perplexity.ts`:

(a) Raise the timeout (line 39):

```ts
const TIMEOUT_MS = 35_000;
```

(b) Add the import near the top imports:

```ts
import {
  recordResearchDiagnostic,
  type ResearchDiagnostic,
  type ResearchOutcome,
} from "./diagnostics";
```

(c) Rewrite the returned provider's `research` to capture timing + emit a diagnostic on every path, store it in a closure, and expose `lastDiagnostic`. Replace the entire `return { name: "perplexity", async research(query) { ... } };` block (lines ~174–238) with:

```ts
  let last: ResearchDiagnostic | null = null;

  async function emit(
    symbol: string,
    outcome: ResearchOutcome,
    startedAt: number,
    extra?: { httpStatus?: number; bodySnippet?: string; cost?: number },
  ): Promise<void> {
    const d: ResearchDiagnostic = {
      at: clock().toISOString(),
      provider: "perplexity",
      symbol,
      outcome,
      latencyMs: Math.max(0, Math.round(clock().getTime() - startedAt)),
      ...(extra?.httpStatus != null ? { httpStatus: extra.httpStatus } : {}),
      ...(extra?.bodySnippet ? { bodySnippet: extra.bodySnippet } : {}),
      ...(extra?.cost != null ? { cost: extra.cost } : {}),
    };
    last = d;
    if (outcome !== "ok") {
      console.warn(
        `[research] perplexity ${symbol}: ${outcome}` +
          (extra?.httpStatus != null ? ` (HTTP ${extra.httpStatus})` : "") +
          (extra?.bodySnippet ? ` — ${extra.bodySnippet}` : ""),
      );
    }
    await recordResearchDiagnostic(d, { dataDir: opts?.dataDir });
  }

  return {
    name: "perplexity",
    lastDiagnostic: () => last,
    async research(query) {
      const startedAt = clock().getTime();
      if (!apiKey) {
        await emit(query.symbol, "no-api-key", startedAt);
        return null; // misconfigured → behave as off
      }

      const date = clock().toISOString().slice(0, 10);

      // HARD CAP — enforced before any request.
      const used = await getResearchCallCount(date, { dataDir: opts?.dataDir });
      if (used >= dailyCap) {
        await emit(query.symbol, "daily-cap-reached", startedAt);
        return null;
      }

      const input =
        query.question ??
        [
          // (unchanged — keep the existing prompt array verbatim)
        ].join("\n");

      let res: Response;
      try {
        res = await doFetch(apiUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            input,
            tools: [{ type: "finance_search" }],
            max_steps: 1,
            max_output_tokens: maxOutputTokens,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        const timedOut =
          err instanceof Error &&
          (err.name === "TimeoutError" || err.name === "AbortError");
        await emit(query.symbol, timedOut ? "timeout" : "network-error", startedAt);
        return null;
      }

      if (!res.ok) {
        let bodySnippet = "";
        try {
          bodySnippet = (await res.text()).slice(0, 200);
        } catch {
          // body unreadable — status alone is enough.
        }
        await emit(query.symbol, "http-error", startedAt, {
          httpStatus: res.status,
          bodySnippet,
        });
        return null; // research is optional — fail soft
      }

      let result: ResearchResult;
      try {
        result = normalize(query.symbol, await res.json(), clock().toISOString());
      } catch {
        await emit(query.symbol, "parse-error", startedAt);
        return null;
      }

      // Only successful calls are metered. Record real cost for visibility;
      // the count remains the hard daily cap.
      await bumpResearchCallCount(date, {
        dataDir: opts?.dataDir,
        cost: result.cost,
      });
      await emit(query.symbol, "ok", startedAt, { cost: result.cost });
      return result;
    },
  };
```

> NOTE for the implementer: keep the existing `input` prompt array exactly as it is today (lines ~190–207) — the snippet above elides it with a comment only to stay readable. Do not delete the prompt.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/research/perplexity.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/research/perplexity.ts src/lib/server/research/types.ts src/lib/server/research/perplexity.test.ts
git commit -m "Capture a specific diagnostic on every Perplexity research path; raise timeout to 35s"
```

---

### Task 3: Orchestrator — derive `perplexityReason` and thread it into `SymbolResearch`

**Files:**
- Modify: `src/lib/server/research/types.ts` (`SymbolResearch.perplexityReason`)
- Modify: `src/lib/server/symbol-research.ts` (`mergeSymbolResearch`, `getSymbolResearch`)
- Modify: `src/lib/server/research/cache.ts:30` (`CACHE_VERSION` 7→8)
- Test: `src/lib/server/research/research.test.ts` (orchestrator tests live here — verify) or co-located symbol-research test.

**Interfaces:**
- Consumes: `diagnosticToStatus`, `researchReasonText` from `./diagnostics`; `provider.lastDiagnostic?.()`.
- Produces: `SymbolResearch.perplexityReason: string | null`; `mergeSymbolResearch` gains a `perplexityReason` arg.

- [ ] **Step 1: Add the field to the type**

In `src/lib/server/research/types.ts`, in `interface SymbolResearch`, right after the `perplexity: PerplexityStatus;` line (≈ line 200):

```ts
  perplexity: PerplexityStatus;
  /** A specific, human failure reason when `perplexity` is not "ok" — e.g.
   *  "HTTP 402 (check API billing)" / "timed out (35s)" / "no API key
   *  configured" (research-observability M1). Null when ok / off / unknown. */
  perplexityReason: string | null;
```

- [ ] **Step 2: Write the failing test**

Locate the orchestrator test (likely `src/lib/server/research/research.test.ts` — confirm it imports `getSymbolResearch`/`mergeSymbolResearch`). Add:

```ts
import { diagnosticToStatus } from "./diagnostics"; // if not already imported

it("surfaces a specific perplexityReason from the provider diagnostic", async () => {
  const provider = {
    name: "perplexity",
    research: async () => null,
    lastDiagnostic: () => ({
      at: "2026-06-27T12:00:00.000Z",
      provider: "perplexity",
      symbol: "LLY",
      outcome: "http-error" as const,
      httpStatus: 402,
      latencyMs: 10,
    }),
  };
  const res = await getSymbolResearch("LLY", {
    provider,
    robinhoodConnected: false,
    dataDir: /* a tmp dir */ undefined,
  });
  expect(res.perplexity).toBe("unavailable");
  expect(res.perplexityReason).toBe("HTTP 402 (check API billing)");
});
```

> If the existing orchestrator tests assert an exact `SymbolResearch` object shape, update those fixtures to include `perplexityReason: null`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/research/research.test.ts`
Expected: FAIL — `perplexityReason` undefined / not on type.

- [ ] **Step 4: Implement**

(a) `mergeSymbolResearch` — add `perplexityReason` to the args object and the returned payload. In `src/lib/server/symbol-research.ts`, change the args type (≈ line 59) and the return (≈ line 114):

```ts
export function mergeSymbolResearch(args: {
  rh: { fundamentals: ResearchFundamentals; profile: ResearchProfile } | null;
  perplexity: ResearchResult | null;
  robinhoodConnected: boolean;
  perplexityStatus: PerplexityStatus;
  perplexityReason: string | null;
}): SymbolResearch {
  const { rh, perplexity, robinhoodConnected, perplexityStatus, perplexityReason } = args;
```

…and in the returned object, right after `perplexity: perplexityStatus,`:

```ts
    perplexity: perplexityStatus,
    perplexityReason,
```

(b) `getSymbolResearch` — derive status + reason from the diagnostic. Replace the status block (≈ lines 178–195) with:

```ts
  const diag = provider.lastDiagnostic?.() ?? null;
  let perplexityStatus: PerplexityStatus;
  let perplexityReason: string | null = null;
  if (!providerOn) {
    perplexityStatus = "off";
  } else if (pplx) {
    perplexityStatus = "ok";
  } else if (diag) {
    perplexityStatus = diagnosticToStatus(diag);
    perplexityReason = researchReasonText(diag);
  } else {
    // Fallback when the provider exposes no diagnostic (e.g. a test fake).
    const cap =
      opts?.dailyCap ?? Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30");
    const used = await getResearchCallCount(date, { dataDir });
    perplexityStatus = used >= cap ? "capped" : "unavailable";
  }

  const merged = mergeSymbolResearch({
    rh,
    perplexity: pplx,
    robinhoodConnected,
    perplexityStatus,
    perplexityReason,
  });
```

Add the import at the top of `symbol-research.ts`:

```ts
import { diagnosticToStatus, researchReasonText } from "./research/diagnostics";
```

(c) The empty-refetch branch that keeps a prior cache (≈ lines 211–214) must also refresh the reason:

```ts
  if (cached) {
    return { ...cached, perplexity: merged.perplexity, perplexityReason: merged.perplexityReason };
  }
```

(d) Bump the cache version in `src/lib/server/research/cache.ts:30`:

```ts
const CACHE_VERSION = 8;
```

Update the adjacent comment to add: `v8 added the \`perplexityReason\` field (research-observability M1).`

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/research/research.test.ts src/lib/server/research/cache.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/symbol-research.ts src/lib/server/research/types.ts src/lib/server/research/cache.ts src/lib/server/research/research.test.ts
git commit -m "Derive a specific research reason in the symbol-research orchestrator"
```

---

### Task 4: Symbol page — surface the specific reason in `perplexityNote`

**Files:**
- Modify: `src/components/symbol/research-context.tsx` (FALLBACK + `perplexityNote`)
- Modify: `src/components/symbol/analyst-consensus.tsx:38`
- Modify: `src/components/symbol/research-summary-card.tsx:48`
- Modify: `src/components/symbol/company-profile.tsx:41`
- Test: none new — these are presentational string changes; covered by typecheck + the manual screenshot at milestone end.

**Interfaces:**
- Consumes: `SymbolResearch.perplexityReason` (Task 3).
- Produces: `perplexityNote(status, reason?)`.

- [ ] **Step 1: Add `perplexityReason` to FALLBACK**

In `research-context.tsx`, in the `FALLBACK` object (≈ line 49), after `perplexity: "unavailable",`:

```ts
  perplexity: "unavailable",
  perplexityReason: null,
```

- [ ] **Step 2: Widen `perplexityNote` to prefer the specific reason**

Replace the `perplexityNote` function (≈ lines 155–166):

```ts
export function perplexityNote(
  status: PerplexityStatus,
  reason?: string | null,
): string | null {
  switch (status) {
    case "off":
      return "AI research is off (a metered Perplexity add-on, off by default) — see the research links below.";
    case "capped":
      return "Today’s research limit was reached (the daily cap keeps cost bounded) — see the research links below.";
    case "unavailable":
      return reason
        ? `Research unavailable — ${reason}. See the research links below.`
        : "Research is unavailable right now — see the research links below.";
    default:
      return null;
  }
}
```

- [ ] **Step 3: Pass the reason at each call site**

- `analyst-consensus.tsx:38`: `research && !c ? perplexityNote(research.perplexity, research.perplexityReason) : null;`
- `research-summary-card.tsx:48`: `const note = research ? perplexityNote(research.perplexity, research.perplexityReason) : null;`
- `company-profile.tsx:41`: `? (perplexityNote(research.perplexity, research.perplexityReason) ??` (keep the rest of that expression intact).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/symbol/research-context.tsx src/components/symbol/analyst-consensus.tsx src/components/symbol/research-summary-card.tsx src/components/symbol/company-profile.tsx
git commit -m "Show the specific research failure reason on the symbol page"
```

---

### Task 5: Persist the specific reason on the proposal (schema + analyze pipeline)

**Files:**
- Modify: `src/lib/schemas.ts` (`ProposalLensSchema` ≈ line 360 + the top-level proposal schema)
- Modify: `src/lib/server/analyze-symbol.ts` (`ResearchContext`, `defaultResearch`, `draftToLens`, top-level + `recordManualProposal`)
- Modify: `src/lib/proposal-lens.ts:49` (`singleLensFromTopLevel`)
- Test: `src/lib/server/analyze-symbol.test.ts` (verify name) — assert the reason persists.

**Interfaces:**
- Consumes: `SymbolResearch.perplexityReason`.
- Produces: `ProposalLensBreakdown.researchStatusReason: string | null`; `TradeProposal.researchStatusReason: string | null`.

- [ ] **Step 1: Add the schema field**

In `src/lib/schemas.ts`, in `ProposalLensSchema`, immediately after the `researchStatus: ResearchStatus.nullable().default(null),` line:

```ts
    researchStatus: ResearchStatus.nullable().default(null),
    // The specific failure reason when research wasn't `ok`
    // (research-observability M1) — e.g. "HTTP 402 (check API billing)". Surfaced
    // on the detail view + export. Null when ok / older records.
    researchStatusReason: z.string().nullable().default(null),
```

Find the **top-level** proposal schema's `researchStatus` field (search `researchStatus:` in `schemas.ts`; the proposal object mirrors the lens fields) and add the same `researchStatusReason: z.string().nullable().default(null),` line right after it.

- [ ] **Step 2: Write the failing test**

In `analyze-symbol.test.ts`, find the test that injects a `research` seam and asserts `researchStatus`. Add a case where the injected research returns `perplexityReason: "HTTP 402 (check API billing)"` and `researchStatus: "unavailable"`, then assert:

```ts
expect(proposal.researchStatusReason).toBe("HTTP 402 (check API billing)");
const valueLens = proposal.lenses.find((l) => l.strategy === "value");
expect(valueLens?.researchStatusReason).toBe("HTTP 402 (check API billing)");
```

> The injected research seam is `opts.research` / `defaultResearch`'s return shape — the `ResearchContext` interface. Add `researchStatusReason` to the test's fixture object.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/server/analyze-symbol.test.ts`
Expected: FAIL — `researchStatusReason` undefined.

- [ ] **Step 4: Implement the threading**

(a) `ResearchContext` interface (≈ line 76–78) — add after `researchStatus: ResearchStatus;`:

```ts
  researchStatus: ResearchStatus;
  /** Specific failure reason when research wasn't ok (research-observability M1). */
  researchStatusReason: string | null;
```

(b) `defaultResearch` — both return branches: in the success branch (≈ line 147) after `researchStatus: r.perplexity,` add `researchStatusReason: r.perplexityReason,`; in the catch branch (≈ line 168) after `researchStatus: "unavailable",` add `researchStatusReason: null,` (the deep fetch threw — no diagnostic to hand back).

(c) `draftToLens` — it currently takes `researchStatus` as a parameter (≈ lines 217, 242, 257, 287). Add a parallel `researchStatusReason: string | null = null` parameter and set `researchStatusReason: d.strategy === "value" ? researchStatusReason : null,` in the lens object next to the existing `researchStatus` assignment. Update both `draftToLens(...)` call sites (≈ lines 427–444): pass `researchStatusReason` for the value lens, `null` for the trend lens (mirroring how `researchStatus` is passed).

(d) In the main body (≈ line 399) add:

```ts
  const researchStatus = research.researchStatus;
  const researchStatusReason = research.researchStatusReason;
```

…and compute the active-lens mirror next to `activeResearchStatus` (≈ line 457):

```ts
  const activeResearchStatusReason =
    active.draft.strategy === "value" ? researchStatusReason : null;
```

(e) Add `researchStatusReason: activeResearchStatusReason,` to BOTH the `TradeProposalSchema.parse({...})` object (≈ line 479, after `researchStatus: activeResearchStatus,`) and the `recordManualProposal({...})` object (≈ line 524, after `researchStatus: activeResearchStatus,`).

(f) `singleLensFromTopLevel` in `proposal-lens.ts:49` — after `researchStatus: p.researchStatus,` add `researchStatusReason: p.researchStatusReason,`.

> If `writers.ts:597` (`recordManualProposal` input type) strictly types its proposal arg, add `researchStatusReason?: TradeProposal["researchStatusReason"];` next to its existing `researchStatus?` field.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/server/analyze-symbol.test.ts src/lib/schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas.ts src/lib/server/analyze-symbol.ts src/lib/proposal-lens.ts src/lib/server/writers.ts src/lib/server/analyze-symbol.test.ts
git commit -m "Persist the specific research failure reason on the proposal"
```

---

### Task 6: Proposal detail view + export — show the specific reason

**Files:**
- Modify: `src/components/research-unavailable-notice.tsx` (optional `reason` prop)
- Modify: `src/components/proposal-detail-view.tsx:281` (pass `lens.researchStatusReason`)
- Modify: `src/lib/proposal-export.ts` (Research section)
- Test: `src/lib/proposal-export.test.ts` (verify name) — assert the reason appears in markdown.

**Interfaces:**
- Consumes: `ProposalLensBreakdown.researchStatusReason`, `TradeProposal.researchStatusReason`.

- [ ] **Step 1: Add the `reason` prop to the notice**

In `research-unavailable-notice.tsx`, change the component to prefer a specific reason:

```ts
export function ResearchUnavailableNotice({
  status,
  reason,
  field = "Cash-flow quality",
}: {
  status: ResearchStatus | null | undefined;
  /** A specific failure reason (research-observability M1); falls back to the
   *  generic status label when absent. */
  reason?: string | null;
  field?: string;
}) {
  const label = reason ?? researchUnavailableLabel(status);
  return (
    <div className="rounded-input border border-warning/30 bg-warning-surface px-3 py-2.5 text-sm text-warning">
      <p className="font-semibold">
        {field}: data unavailable{label ? ` · ${label}` : ""}
      </p>
```

(keep the rest of the component unchanged).

- [ ] **Step 2: Pass the reason from the detail view**

In `proposal-detail-view.tsx` (≈ line 279–282):

```tsx
                <ResearchUnavailableNotice
                  status={lens.researchStatus}
                  reason={lens.researchStatusReason}
                  field="Cash-flow quality"
                />
```

- [ ] **Step 3: Write the failing export test**

In `proposal-export.test.ts`, add:

```ts
it("includes the specific research failure reason in the Research section", () => {
  const p = makeProposal({
    catalyst: null,
    catalystState: "unavailable",
    researchStatus: "unavailable",
    researchStatusReason: "HTTP 402 (check API billing)",
  });
  const md = proposalToMarkdown(p, { generatedAt: "2026-06-27T12:00:00.000Z" });
  expect(md).toContain("HTTP 402 (check API billing)");
});
```

> Use the file's existing proposal factory (named `makeProposal` / similar) and the existing `proposalToMarkdown` import.

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run src/lib/proposal-export.test.ts`
Expected: FAIL — reason absent from markdown.

- [ ] **Step 5: Implement the export change**

In `proposal-export.ts`, after the existing Research-section lines (`lines.push("## Research", ""); lines.push(catalystResearchText(p), "");`), add:

```ts
  lines.push("## Research", "");
  lines.push(catalystResearchText(p), "");
  if (isResearchUnavailable(p.researchStatus)) {
    const reason = p.researchStatusReason ?? researchUnavailableLabel(p.researchStatus);
    lines.push("", `_Value-quality research unavailable — ${reason}._`, "");
  }
```

Add the import at the top of `proposal-export.ts`:

```ts
import {
  isResearchUnavailable,
  researchUnavailableLabel,
} from "@/lib/research-availability";
```

> Mirror the same addition in `buildProposalPdfDocDefinition` (the PDF builder, ≈ lines 241–254) — append a small italic line with the same `reason` text to the PDF's Research block, matching how the catalyst prose is added there.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/proposal-export.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm typecheck` (expected: clean)

```bash
git add src/components/research-unavailable-notice.tsx src/components/proposal-detail-view.tsx src/lib/proposal-export.ts src/lib/proposal-export.test.ts
git commit -m "Show the specific research failure reason on the proposal detail view and export"
```

---

### Task 7: Diagnostics surface — research-provider health on the Logs page

**Files:**
- Create: `src/components/logs/research-health-panel.tsx`
- Modify: `src/app/logs/page.tsx`
- Test: `src/components/logs/research-health-panel.test.tsx` (light render test of the pure formatter, optional but preferred).

**Interfaces:**
- Consumes: `readResearchDiagnostics` from `@/lib/server/research/diagnostics`; `researchReasonText`.
- Produces: `<ResearchHealthPanel diagnostics={ResearchDiagnostic[]} />`.

- [ ] **Step 1: Write a failing formatter test** (pure helper, no DOM)

```tsx
// src/components/logs/research-health-panel.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/logs/research-health-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the panel**

```tsx
// src/components/logs/research-health-panel.tsx
import {
  researchReasonText,
  type ResearchDiagnostic,
} from "@/lib/server/research/diagnostics";

/** One-line summary of a research call for the health panel. Pure (tested). */
export function formatDiagnosticLine(d: ResearchDiagnostic): string {
  const reason = researchReasonText(d);
  const cost = d.cost != null ? ` · $${d.cost.toFixed(4)}` : "";
  return `${d.symbol} · ${reason ?? "ok"} · ${d.latencyMs}ms${cost}`;
}

/**
 * Research-provider health (research-observability M1). The last research calls'
 * outcome / reason / latency / cost, so a silent failure (the LLY cash-flow
 * fetch) is visible at a glance instead of an invisible `null`.
 */
export function ResearchHealthPanel({
  diagnostics,
}: {
  diagnostics: ResearchDiagnostic[];
}) {
  if (diagnostics.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface-raised p-6">
        <p className="text-sm text-fg-muted">No research calls recorded yet.</p>
      </div>
    );
  }
  const [latest, ...rest] = diagnostics;
  const ok = latest.outcome === "ok";
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-fg">Research provider health</h2>
      <p className="mt-1 text-xs text-fg-subtle">
        Last research call and recent history (Perplexity finance_search).
      </p>
      <p
        className={`mt-3 text-sm font-medium ${ok ? "text-fg" : "text-warning"}`}
      >
        Last call: {formatDiagnosticLine(latest)}
      </p>
      {rest.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-fg-muted">
          {rest.map((d, i) => (
            <li key={`${d.at}-${i}`} className="tabular-nums">
              {formatDiagnosticLine(d)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/logs/research-health-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it on the Logs page**

In `src/app/logs/page.tsx`, add imports and render the panel above the run logs:

```tsx
import { ResearchHealthPanel } from "@/components/logs/research-health-panel";
import { readResearchDiagnostics } from "@/lib/server/research/diagnostics";
```

In the component body:

```tsx
export default async function LogsPage() {
  const logs = await readRunLogs();
  const diagnostics = await readResearchDiagnostics();
```

And add the panel inside the outer `<div>`, before the run-logs block (so it shows even when there are no run logs):

```tsx
      <div className="mb-8">
        <ResearchHealthPanel diagnostics={diagnostics} />
      </div>
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck` (expected: clean)

```bash
git add src/components/logs/research-health-panel.tsx src/components/logs/research-health-panel.test.tsx src/app/logs/page.tsx
git commit -m "Add a research-provider health panel to the Logs page"
```

---

### Task 8: Docs + full verification + PR

**Files:**
- Modify: `.agents/infra.md` (record the diagnostics ring + the 35s timeout)

- [ ] **Step 1: Update the infra doc**

In `.agents/infra.md`, in the Perplexity research paragraph (≈ line 15) add a sentence:

> Every research call — success or failure — now records a `ResearchDiagnostic` (outcome / HTTP status / latency / cost) to `data/research/diagnostics.json` (a 20-entry ring), logged and surfaced on the **Logs page** ("Research provider health") and as a specific reason on the symbol page + proposal/export (research-observability M1). The agent-call timeout is **35s** (structured `finance_search` calls are slow).

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: PASS (no regressions). If a pre-existing fixture asserts an exact `SymbolResearch`/proposal shape, update it to include the new nullable fields.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 4: Forced-failure manual check (acceptance evidence)**

Temporarily set a bad key and run the analyze pipeline for one symbol (or unset `PERPLEXITY_API_KEY` with `RESEARCH_PROVIDER=perplexity`), then:
- Confirm `data/research/diagnostics.json` shows the specific outcome (`no-api-key` / `http-error` with status).
- Confirm the Logs page "Research provider health" shows it.
- Confirm the symbol page note / proposal export shows the specific reason.
Capture screenshots for the milestone review. Restore the key afterward.

- [ ] **Step 5: Commit docs + open the PR**

```bash
git add .agents/infra.md
git commit -m "Document the research diagnostics ring and the 35s timeout"
git push -u origin feature/research-observability
gh pr create --base main --title "Research observability: make every research failure legible" --body "<summary of M1 acceptance: specific reason logged + surfaced on symbol page/proposal/export, timeout raised to 35s, diagnostics health panel on Logs; tested per failure mode>"
```

---

## Self-Review

**Spec coverage (M1 acceptance):**
- "capture + log the specific failure reason instead of a bare null" → Task 1 (outcomes) + Task 2 (emit/log on every path). ✅
- Reasons enumerated (`no-api-key`, `provider-off`, `daily-cap-reached`, `http-<status>` + body snippet, `timeout`, `parse-error`, `network-error`) → Task 1 `ResearchOutcome` + Task 2 branches. ✅
- "Surface the specific reason on the proposal (and export)" → Task 5 (persist) + Task 6 (detail view + markdown + PDF). ✅
- Symbol page surfacing → Task 4. ✅
- "Raise the timeout 15s → ~35s" → Task 2 Step 4(a). ✅
- "diagnostics surface (last research call: status, reason, latency, cost) in Operations/Logs" → Task 7 (Logs page). ✅
- "tested per failure mode" → Task 2 (six modes) + Task 1 mappers + Tasks 3/5/6 propagation tests. ✅
- CHECK FIRST (billing/credits) is operational, not code — it is verified during Task 8 Step 4's forced-failure run, which will now name the real cause (e.g. HTTP 402). ✅

**Out-of-scope respected:** no gate/rail/execution/red-team-numeric changes; no Yahoo; the red-team still receives only the coarse `researchStatus` (its text label is unchanged). ✅

**Type consistency:** `perplexityReason` (SymbolResearch) and `researchStatusReason` (proposal/lens) are the two names used; `researchReasonText`/`diagnosticToStatus`/`recordResearchDiagnostic`/`readResearchDiagnostics` are referenced identically across tasks. `lastDiagnostic?()` optional everywhere. Cache version 7→8. ✅

**Note for executor:** a few exact line numbers ("≈ line N") are approximate — the surrounding code is quoted so you can anchor the edit. Confirm the test file names (`research.test.ts`, `analyze-symbol.test.ts`, `proposal-export.test.ts`, `schemas.test.ts`) exist before Step "write the failing test"; if a co-located name differs, place the test next to the module under test.
