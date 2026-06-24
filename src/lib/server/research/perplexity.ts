import "server-only";

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
      const text = item.content?.find((c) => c?.type === "text")?.text;
      if (typeof text === "string") summary = text;
    }
  }

  // De-dup sources by url (the same filing may back several blocks).
  const seen = new Set<string>();
  const dedupedSources = sources.filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true),
  );

  const result: ResearchResult = {
    provider: "perplexity",
    symbol,
    summary: summary.trim(),
    sources: dedupedSources,
    usedAt,
    finance,
    categories: [...categories],
    tickers: [...tickers],
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
        `Summarize the latest fundamentals, earnings, analyst views, and catalysts for ${query.symbol}. Be concise and cite sources.`;

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
