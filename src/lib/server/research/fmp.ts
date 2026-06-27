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
 * Financial Modeling Prep (FMP) v3 adapter — a keyed, default-off, capped
 * fundamentals provider (see `.agents/infra.md`). CONTEXT ONLY: fundamentals /
 * cash-flow / dividend / profile for research; never order pricing or execution.
 *
 * Default-off: with no `FMP_API_KEY`, no requests are ever made and the
 * provider returns null on every call. Each invocation issues up to 5 parallel
 * FMP v3 HTTP requests (profile, ratios-ttm, key-metrics-ttm, cash-flow-statement,
 * stock_dividend); the daily cap counts **invocations** (not individual requests).
 *
 * NOTE: the FMP v3 field mapping below was written against FMP's docs without a
 * live key; verify against a real key before setting FMP_API_KEY in production.
 */

export interface FmpOpts {
  apiKey?: string;
  apiUrl?: string;
  dailyCap?: number;
  dataDir?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_URL =
  process.env.FMP_API_URL ?? "https://financialmodelingprep.com/api/v3";

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

      const used = await getResearchCallCount(date, { dataDir: opts?.dataDir });
      if (used >= dailyCap) {
        await emit(query.symbol, "daily-cap-reached", startedAt);
        return null;
      }

      const sym = encodeURIComponent(query.symbol);

      // Fetch all 5 endpoints in parallel. Note: cash-flow-statement already
      // has query params (period + limit), so we use &apikey= not ?apikey=.
      const urls = [
        `${apiUrl}/profile/${sym}?apikey=${apiKey}`,
        `${apiUrl}/ratios-ttm/${sym}?apikey=${apiKey}`,
        `${apiUrl}/key-metrics-ttm/${sym}?apikey=${apiKey}`,
        `${apiUrl}/cash-flow-statement/${sym}?period=annual&limit=5&apikey=${apiKey}`,
        `${apiUrl}/historical-price-full/stock_dividend/${sym}?apikey=${apiKey}`,
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

      const [profileJson, ratiosTtmJson, keyMetricsTtmJson, cashFlowJson, dividendJson] =
        await Promise.all(settled.map(parseBody));

      const raw: FmpRaw = {
        profile: profileJson,
        ratiosTtm: ratiosTtmJson,
        keyMetricsTtm: keyMetricsTtmJson,
        cashFlow: cashFlowJson,
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

      await bumpResearchCallCount(date, { dataDir: opts?.dataDir });
      await emit(query.symbol, "ok", startedAt);
      return result;
    },
  };
}
