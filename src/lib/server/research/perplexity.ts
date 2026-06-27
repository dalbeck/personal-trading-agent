import "server-only";

import { parseStructuredResearch } from "./parse";
import { bumpResearchCallCount, getResearchCallCount } from "./usage";
import {
  recordResearchDiagnostic,
  type ResearchDiagnostic,
  type ResearchOutcome,
} from "./diagnostics";
import type {
  ResearchFinanceResult,
  ResearchProvider,
  ResearchResult,
  ResearchSource,
} from "./types";

/**
 * Perplexity `finance_search` adapter — the single sanctioned metered API
 * (see `.agents/infra.md`). CONTEXT ONLY: fundamentals / earnings / analyst /
 * catalyst summaries, never order pricing or execution.
 *
 * Uses the **Agent API** (`POST /v1/agent` with the `finance_search` tool) —
 * NOT the Sonar chat-completions endpoint — so we get structured
 * `finance_results` (quotes / income / balance / cash-flow / analyst /
 * earnings), not prose. Cheap config: model `perplexity/sonar`, `max_steps=1`.
 *
 * Hard cost guardrail: a per-day invocation cap is enforced **in code** before
 * any request — once reached, further calls are refused and logged, not sent.
 */

export interface PerplexityOpts {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  dailyCap?: number;
  maxOutputTokens?: number;
  dataDir?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_URL =
  process.env.PERPLEXITY_API_URL ?? "https://api.perplexity.ai/v1/agent";
const TIMEOUT_MS = 35_000;

/** The Agent API expects a namespaced model id (e.g. `perplexity/sonar`). */
function namespacedModel(model: string): string {
  return model.includes("/") ? model : `perplexity/${model}`;
}

function toSources(raw: unknown): ResearchSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) =>
      typeof s === "string"
        ? { title: s, url: s }
        : {
            title: String((s as { title?: string }).title ?? ""),
            url: String((s as { url?: string }).url ?? ""),
          },
    )
    .filter((s) => s.url);
}

type AgentOutputItem = {
  type?: string;
  // finance_results
  categories?: unknown;
  tickers?: unknown;
  results?: { content?: unknown; sources?: unknown }[];
  // message
  content?: { type?: string; text?: string }[];
};

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((x) => String(x)).filter(Boolean) : [];
}

/** Parse the Agent API `output[]` (finance_results blocks + final message).
 *  Returns the result plus the structured-JSON parse status so the caller can
 *  treat a truncated block as a soft failure (research-output-completes M1). */
function normalize(
  symbol: string,
  json: unknown,
  usedAt: string,
): { result: ResearchResult; jsonStatus: "ok" | "missing" | "parse-error" } {
  const obj = (json ?? {}) as { output?: AgentOutputItem[]; usage?: unknown };
  const output = Array.isArray(obj.output) ? obj.output : [];

  const finance: ResearchFinanceResult[] = [];
  const categories = new Set<string>();
  const tickers = new Set<string>();
  const sources: ResearchSource[] = [];
  let summary = "";

  for (const item of output) {
    if (item?.type === "finance_results") {
      const itemCategories = strings(item.categories);
      const itemTickers = strings(item.tickers);
      itemCategories.forEach((c) => categories.add(c));
      itemTickers.forEach((t) => tickers.add(t));
      for (const r of item.results ?? []) {
        const blockSources = toSources(r?.sources);
        sources.push(...blockSources);
        finance.push({
          categories: itemCategories,
          tickers: itemTickers,
          content: typeof r?.content === "string" ? r.content : "",
          sources: blockSources,
        });
      }
    } else if (item?.type === "message") {
      // The Agent API emits the synthesized answer as message parts of type
      // `output_text` (NOT `text`). Accept either spelling — and an untyped part
      // that still carries `.text` — and join every text-bearing part so the
      // summary is never silently dropped.
      const text = (item.content ?? [])
        .filter(
          (c) =>
            typeof c?.text === "string" &&
            (c.type === "output_text" || c.type === "text" || c.type == null),
        )
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) summary = text;
    }
  }

  // De-dup sources by url (the same filing may back several blocks).
  const seen = new Set<string>();
  const dedupedSources = sources.filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true),
  );

  // Lift the structured profile / fundamentals / consensus out of the message's
  // JSON block, and use the prose with that block stripped as the summary.
  const structured = parseStructuredResearch(summary.trim());

  const result: ResearchResult = {
    provider: "perplexity",
    symbol,
    summary: structured.summary,
    sources: dedupedSources,
    usedAt,
    finance,
    categories: [...categories],
    tickers: [...tickers],
    profile: structured.profile,
    fundamentals: structured.fundamentals,
    consensus: structured.consensus,
    earnings: structured.earnings,
    catalysts: structured.catalysts,
    cashFlow: structured.cashFlow,
    dividend: structured.dividend,
  };
  const cost = extractCost(obj.usage);
  if (cost != null) result.cost = cost;
  return { result, jsonStatus: structured.jsonStatus };
}

/** Real per-call cost (USD), when the Agent API reports it. */
function extractCost(usage: unknown): number | undefined {
  const total = (usage as { cost?: { total_cost?: unknown } } | undefined)?.cost
    ?.total_cost;
  return typeof total === "number" ? total : undefined;
}

export function createPerplexityProvider(
  opts?: PerplexityOpts,
): ResearchProvider {
  const apiKey = opts?.apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
  const apiUrl = opts?.apiUrl ?? DEFAULT_URL;
  const model = namespacedModel(
    opts?.model ?? process.env.PERPLEXITY_MODEL ?? "sonar",
  );
  const dailyCap =
    opts?.dailyCap ??
    Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30") ??
    30;
  // The structured JSON (profile → fundamentals → consensus → earnings →
  // catalysts → cashFlow → dividend) plus a short prose summary must fit in one
  // response. 512 truncated it mid-stream (the LLY cashFlow/dividend failure);
  // a generous budget lets the full schema complete (research-output-completes M1).
  const maxOutputTokens =
    opts?.maxOutputTokens ??
    Number(process.env.PERPLEXITY_MAX_OUTPUT_TOKENS ?? "4000") ??
    4000;
  const doFetch = opts?.fetchImpl ?? fetch;
  const clock = opts?.now ?? (() => new Date());

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
          `Research ${query.symbol}. Output a fenced \`\`\`json code block FIRST — before any prose — with these exact keys, using null for anything you cannot verify (do not guess). The JSON block must be COMPLETE and valid; emit it before the summary so it is never the part that gets cut off:`,
          '{"profile":{"name":string|null,"domain":string|null,"ceo":string|null,"employees":number|null,"sector":string|null,"industry":string|null,"country":string|null,"exchange":string|null,"ipoDate":string|null,"description":string|null},' +
            '"fundamentals":{"marketCap":string|null,"peRatio":number|null,"eps":number|null,"dividendYield":string|null},' +
            '"consensus":{"rating":string|null,"targetMean":number|null,"targetHigh":number|null,"targetLow":number|null,"analystCount":number|null},' +
            '"earnings":[{"period":string,"epsActual":number|null,"epsEstimate":number|null,"surprisePct":string|null,"priceMovePct":string|null}],' +
            '"catalysts":[string],' +
            '"cashFlow":{"operatingCashFlow":string|null,"freeCashFlow":string|null,"fcfTrend":"growing"|"stable"|"declining"|null,"fcfYield":string|null,"netDebt":string|null,"debtToEquity":number|null,"interestCoverage":number|null},' +
            '"dividend":{"dividendYield":string|null,"payoutRatio":string|null,"fcfPayout":string|null,"fcfCoverage":number|null,"growthStreakYears":number|null,"dividendCagr":string|null}}',
          "name is the official company name (e.g. \"Apple, Inc.\"); domain is the primary website host only (e.g. \"apple.com\"); marketCap may use a suffix (e.g. \"3.1T\"); dividendYield as a percent string (e.g. \"0.72%\"); ipoDate as YYYY-MM-DD; exchange like \"NASDAQ\"/\"NYSE\"; country like \"United States\"; description one sentence.",
          "earnings is the last up-to-4 reported quarters oldest-first (period like \"Q1 FY26\"; surprisePct and priceMovePct as percent strings like \"+4.3%\"/\"-2.1%\"). catalysts is up to 6 short upcoming-catalyst phrases (e.g. \"Q2 earnings Jul 24\"). Omit either array if you have nothing verifiable.",
          "cashFlow is trailing-twelve-month cash-flow quality: operatingCashFlow and freeCashFlow as money (suffix ok, e.g. \"1.2B\"); fcfTrend is the recent direction of free cash flow; fcfYield as a percent string (FCF ÷ market cap, e.g. \"4.1%\") — omit it and it will be derived from FCF and market cap; netDebt as money (negative = net cash); debtToEquity and interestCoverage as plain numbers. Use null for anything you cannot verify.",
          "dividend is dividend sustainability (null the whole block if the company pays no dividend): dividendYield, payoutRatio (dividends ÷ earnings), fcfPayout (dividends ÷ FCF) and dividendCagr as percent strings (e.g. \"45%\"); fcfCoverage as a plain multiple (FCF ÷ dividends, e.g. 2.4) — give fcfPayout OR fcfCoverage and the other is derived; growthStreakYears as the count of consecutive annual dividend increases. Use null for anything you cannot verify.",
          "",
          `After the closed \`\`\`json block, add a concise 1–2 sentence summary of the latest fundamentals, earnings, analyst views, and catalysts for ${query.symbol}, and cite sources. The JSON must come first and be complete.`,
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
      let jsonStatus: "ok" | "missing" | "parse-error";
      try {
        ({ result, jsonStatus } = normalize(
          query.symbol,
          await res.json(),
          clock().toISOString(),
        ));
      } catch {
        await emit(query.symbol, "parse-error", startedAt);
        return null;
      }

      // The call succeeded and was billed regardless of the structured outcome,
      // so it always counts against the hard daily cost cap.
      await bumpResearchCallCount(date, {
        dataDir: opts?.dataDir,
        cost: result.cost,
      });

      // Truncation guard (research-output-completes M1): a structured block that
      // was opened but is unparseable means the output-token budget cut it off
      // mid-stream (the LLY cashFlow/dividend failure). Do NOT return it as a
      // clean success with null value data — record `truncated` and fail soft so
      // the orchestrator falls through to the FMP fallback instead of caching a
      // null-cashFlow result tagged "ok".
      if (jsonStatus === "parse-error") {
        await emit(query.symbol, "truncated", startedAt, { cost: result.cost });
        return null;
      }

      await emit(query.symbol, "ok", startedAt, { cost: result.cost });
      return result;
    },
  };
}
