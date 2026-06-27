import "server-only";

import { parseStructuredResearch } from "./parse";
import { bumpResearchCallCount, getResearchCallCount } from "./usage";
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
const TIMEOUT_MS = 15_000;

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

/** Parse the Agent API `output[]` (finance_results blocks + final message). */
function normalize(symbol: string, json: unknown, usedAt: string): ResearchResult {
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
  return result;
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
  const maxOutputTokens = opts?.maxOutputTokens ?? 512;
  const doFetch = opts?.fetchImpl ?? fetch;
  const clock = opts?.now ?? (() => new Date());

  return {
    name: "perplexity",
    async research(query) {
      if (!apiKey) return null; // misconfigured → behave as off

      const date = clock().toISOString().slice(0, 10);

      // HARD CAP — enforced before any request.
      const used = await getResearchCallCount(date, { dataDir: opts?.dataDir });
      if (used >= dailyCap) {
        console.warn(
          `[research] Perplexity daily cap (${dailyCap}) reached — refusing call for ${query.symbol}.`,
        );
        return null;
      }

      const input =
        query.question ??
        [
          `Summarize the latest fundamentals, earnings, analyst views, and catalysts for ${query.symbol}. Be concise and cite sources.`,
          "",
          "Then append a fenced ```json code block with these exact keys, using null for anything you cannot verify (do not guess):",
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
        ].join("\n");

      try {
        const res = await doFetch(apiUrl, {
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
        if (!res.ok) return null; // research is optional — fail soft
        const result = normalize(query.symbol, await res.json(), clock().toISOString());
        // Only successful calls are metered. Record real cost for visibility;
        // the count remains the hard daily cap.
        await bumpResearchCallCount(date, {
          dataDir: opts?.dataDir,
          cost: result.cost,
        });
        return result;
      } catch {
        return null;
      }
    },
  };
}
