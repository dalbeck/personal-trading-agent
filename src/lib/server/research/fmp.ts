import "server-only";

import { bumpResearchCallCount, getResearchCallCount } from "./usage";
import {
  recordResearchDiagnostic,
  type ResearchDiagnostic,
  type ResearchOutcome,
} from "./diagnostics";
import type { ResearchProvider, ResearchResult } from "./types";
import { mapFmpToResearch, type FmpRaw } from "./fmp-map";

/**
 * Financial Modeling Prep (FMP) **stable** adapter — a keyed, default-off,
 * capped fundamentals provider (see `.agents/infra.md`). CONTEXT ONLY:
 * fundamentals / cash-flow / dividend / profile for research; never order
 * pricing or execution.
 *
 * Targets FMP's stable API (`/stable/...`, query-param style: `?symbol=…&apikey=…`).
 * The legacy v3 routes (`/api/v3/...`) 403 "Legacy Endpoint" for keys issued
 * after 2025-08-31 — this adapter was migrated off them (see the spec).
 *
 * Default-off: with no `FMP_API_KEY`, no requests are ever made and the
 * provider returns null on every call. Each invocation issues up to 6 parallel
 * stable HTTP requests (profile, ratios-ttm, key-metrics-ttm, cash-flow-statement,
 * balance-sheet-statement, dividends); the daily cap counts **invocations** (not
 * individual requests).
 *
 * Free-tier caveat: a free FMP plan symbol-gates the statement endpoints
 * (HTTP 402 "not available under your current subscription") for non-whitelisted
 * symbols — profile still returns 200, so a gated symbol yields profile-only data
 * (cashFlow/dividend null) and the orchestrator falls through to Perplexity.
 */

export interface FmpOpts {
  apiKey?: string;
  apiUrl?: string;
  dailyCap?: number;
  dataDir?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** FMP's own per-day usage counter key — kept separate from Perplexity's metered
 *  cap so the free, always-consulted FMP primary never throttles the paid API
 *  (fmp-primary-for-fundamentals M2). */
const FMP_USAGE_KEY = "fmp";

const DEFAULT_URL =
  process.env.FMP_API_URL ?? "https://financialmodelingprep.com/stable";

export function createFmpProvider(opts?: FmpOpts): ResearchProvider {
  const apiKey = opts?.apiKey ?? process.env.FMP_API_KEY ?? "";
  const apiUrl = opts?.apiUrl ?? DEFAULT_URL;
  const dailyCap =
    opts?.dailyCap ?? Number(process.env.FMP_DAILY_CALL_CAP ?? "40");
  const doFetch = opts?.fetchImpl ?? fetch;
  const clock = opts?.now ?? (() => new Date());

  let last: ResearchDiagnostic | null = null;

  async function emit(
    symbol: string,
    outcome: ResearchOutcome,
    startedAt: number,
    extra?: { httpStatus?: number; bodySnippet?: string },
  ): Promise<void> {
    const d: ResearchDiagnostic = {
      at: clock().toISOString(),
      provider: "fmp",
      symbol,
      outcome,
      latencyMs: Math.max(0, Math.round(clock().getTime() - startedAt)),
      ...(extra?.httpStatus != null ? { httpStatus: extra.httpStatus } : {}),
      ...(extra?.bodySnippet ? { bodySnippet: extra.bodySnippet } : {}),
    };
    last = d;
    if (outcome !== "ok") {
      console.warn(
        `[research] fmp ${symbol}: ${outcome}` +
          (extra?.httpStatus != null ? ` (HTTP ${extra.httpStatus})` : "") +
          (extra?.bodySnippet ? ` — ${extra.bodySnippet}` : ""),
      );
    }
    await recordResearchDiagnostic(d, { dataDir: opts?.dataDir });
  }

  return {
    name: "fmp",
    lastDiagnostic: () => last,
    async research(query) {
      const startedAt = clock().getTime();

      if (!apiKey) {
        await emit(query.symbol, "no-api-key", startedAt);
        return null;
      }

      const date = clock().toISOString().slice(0, 10);

      const used = await getResearchCallCount(date, {
        dataDir: opts?.dataDir,
        key: FMP_USAGE_KEY,
      });
      if (used >= dailyCap) {
        await emit(query.symbol, "daily-cap-reached", startedAt);
        return null;
      }

      const sym = encodeURIComponent(query.symbol);

      // Fetch all 6 stable endpoints in parallel. Stable uses the query-param
      // style (`?symbol=…&apikey=…`), NOT the v3 path-param style.
      const urls = [
        `${apiUrl}/profile?symbol=${sym}&apikey=${apiKey}`,
        `${apiUrl}/ratios-ttm?symbol=${sym}&apikey=${apiKey}`,
        `${apiUrl}/key-metrics-ttm?symbol=${sym}&apikey=${apiKey}`,
        `${apiUrl}/cash-flow-statement?symbol=${sym}&period=annual&limit=5&apikey=${apiKey}`,
        `${apiUrl}/balance-sheet-statement?symbol=${sym}&period=annual&limit=1&apikey=${apiKey}`,
        `${apiUrl}/dividends?symbol=${sym}&apikey=${apiKey}`,
      ] as const;

      const settled = await Promise.allSettled(
        urls.map((url) =>
          doFetch(url, { signal: AbortSignal.timeout(20_000) }),
        ),
      );

      // If every fetch rejected → network or timeout error.
      const allRejected = settled.every((s) => s.status === "rejected");
      if (allRejected) {
        const timedOut = settled.some((s) => {
          if (s.status !== "rejected") return false;
          const err = s.reason;
          return (
            err instanceof Error &&
            (err.name === "TimeoutError" || err.name === "AbortError")
          );
        });
        await emit(query.symbol, timedOut ? "timeout" : "network-error", startedAt);
        return null;
      }

      // Check for auth/rate-limit errors on the profile or ratios endpoints
      // (indices 0 and 1). If both are non-2xx and no endpoint produced data,
      // emit http-error with the profile/ratios status.
      const profileSettled = settled[0];
      const ratiosSettled = settled[1];
      const profileRes =
        profileSettled.status === "fulfilled" ? profileSettled.value : null;
      const ratiosRes =
        ratiosSettled.status === "fulfilled" ? ratiosSettled.value : null;

      // Determine if any fulfilled response is 2xx
      const anySuccessful = settled.some(
        (s) => s.status === "fulfilled" && s.value.ok,
      );

      if (!anySuccessful) {
        // All fulfilled are non-2xx (or all rejected). Use profile/ratios for
        // the error status.
        const errRes = profileRes ?? ratiosRes;
        if (errRes != null) {
          let bodySnippet = "";
          try {
            bodySnippet = (await errRes.text()).slice(0, 200);
          } catch {
            // body unreadable — status alone is enough
          }
          await emit(query.symbol, "http-error", startedAt, {
            httpStatus: errRes.status,
            bodySnippet,
          });
          return null;
        }
        // Defensive fallback: no successful response and no http-error status (all-rejected case already handled above).
        await emit(query.symbol, "network-error", startedAt);
        return null;
      }

      // Parse each fulfilled 2xx body as JSON. Guard every parse.
      async function parseBody(
        s: (typeof settled)[number],
      ): Promise<unknown> {
        if (s.status !== "fulfilled") return null;
        if (!s.value.ok) return null;
        try {
          return await s.value.json();
        } catch {
          return null;
        }
      }

      const [
        profileJson,
        ratiosTtmJson,
        keyMetricsTtmJson,
        cashFlowJson,
        balanceSheetJson,
        dividendJson,
      ] = await Promise.all(settled.map(parseBody));

      const raw: FmpRaw = {
        profile: profileJson,
        ratiosTtm: ratiosTtmJson,
        keyMetricsTtm: keyMetricsTtmJson,
        cashFlow: cashFlowJson,
        balanceSheet: balanceSheetJson,
        dividendHistory: dividendJson,
      };

      const mapped = mapFmpToResearch(raw);

      // If every mapped group is null, there's no usable data.
      if (
        mapped.fundamentals === null &&
        mapped.profile === null &&
        mapped.cashFlow === null &&
        mapped.dividend === null
      ) {
        await emit(query.symbol, "parse-error", startedAt);
        return null;
      }

      const usedAt = clock().toISOString();

      const result: ResearchResult = {
        provider: "fmp",
        symbol: query.symbol,
        summary: "",
        sources: [],
        usedAt,
        finance: [],
        categories: [],
        tickers: [query.symbol],
        profile: mapped.profile,
        fundamentals: mapped.fundamentals,
        consensus: null,
        earnings: [],
        catalysts: [],
        cashFlow: mapped.cashFlow,
        dividend: mapped.dividend,
      };

      await bumpResearchCallCount(date, {
        dataDir: opts?.dataDir,
        key: FMP_USAGE_KEY,
      });
      await emit(query.symbol, "ok", startedAt);
      return result;
    },
  };
}
