import "server-only";

import { bumpResearchCallCount, getResearchCallCount } from "./usage";
import type { ResearchProvider, ResearchResult, ResearchSource } from "./types";

/**
 * Perplexity `finance_search` adapter — the single sanctioned metered API
 * (see `.agents/infra.md`). CONTEXT ONLY: fundamentals / earnings / analyst /
 * catalyst summaries, never order pricing or execution.
 *
 * Hard cost guardrail: a per-day invocation cap is enforced **in code** before
 * any request — once reached, further calls are refused and logged, not sent.
 * Uses the cheap config (model=sonar, max_steps=1, small max_output_tokens).
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
  process.env.PERPLEXITY_API_URL ?? "https://api.perplexity.ai/chat/completions";
const TIMEOUT_MS = 15_000;

function normalize(symbol: string, json: unknown, usedAt: string): ResearchResult {
  const obj = (json ?? {}) as Record<string, unknown>;
  const choices = (obj.choices as { message?: { content?: string } }[]) ?? [];
  const summary =
    choices[0]?.message?.content ??
    (typeof obj.answer === "string" ? obj.answer : "") ??
    "";
  const rawSources = (obj.citations ?? obj.sources ?? []) as unknown[];
  const sources: ResearchSource[] = rawSources
    .map((s) =>
      typeof s === "string"
        ? { title: s, url: s }
        : {
            title: String((s as { title?: string }).title ?? ""),
            url: String((s as { url?: string }).url ?? ""),
          },
    )
    .filter((s) => s.url);
  return { provider: "perplexity", symbol, summary: summary.trim(), sources, usedAt };
}

export function createPerplexityProvider(
  opts?: PerplexityOpts,
): ResearchProvider {
  const apiKey = opts?.apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
  const apiUrl = opts?.apiUrl ?? DEFAULT_URL;
  const model = opts?.model ?? process.env.PERPLEXITY_MODEL ?? "sonar";
  const dailyCap =
    opts?.dailyCap ??
    Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30") ??
    30;
  const maxOutputTokens = opts?.maxOutputTokens ?? 400;
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

      const prompt =
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
            max_steps: 1,
            max_output_tokens: maxOutputTokens,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null; // research is optional — fail soft
        const result = normalize(query.symbol, await res.json(), clock().toISOString());
        // Only successful calls are metered.
        await bumpResearchCallCount(date, { dataDir: opts?.dataDir });
        return result;
      } catch {
        return null;
      }
    },
  };
}
