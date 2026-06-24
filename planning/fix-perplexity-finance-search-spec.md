# Fix Spec — switch Perplexity adapter to the real `finance_search` tool

_Small, self-contained fix for a local Claude Code session. Read `AGENTS.md` + `.agents/infra.md` first. One feature branch, one PR._

## Problem
`src/lib/server/research/perplexity.ts` currently POSTs to the **Sonar chat endpoint** (`https://api.perplexity.ai/chat/completions`) with a `messages` array and a finance-themed prompt. That returns prose, **not** the structured `finance_search` data (quotes, income/balance/cash-flow, analyst estimates, earnings beat/miss). The `max_steps: 1` field it sends is an Agent-API param the chat endpoint ignores.

## Goal
Call the **Agent API** `finance_search` tool and parse its structured output. **Keep everything else identical**: the `ResearchProvider` interface, default-off factory, in-code daily cap, "only successful calls metered," fail-soft behavior, `server-only`, and the `research:perplexity` journal tag.

## Changes
1. **Endpoint + request shape.** Default URL → `https://api.perplexity.ai/v1/agent`. POST body:
   ```json
   {
     "model": "perplexity/sonar",
     "input": "<finance question for the symbol>",
     "tools": [{ "type": "finance_search" }],
     "max_steps": 1,
     "max_output_tokens": 512
   }
   ```
   Auth header unchanged (`Authorization: Bearer ${PERPLEXITY_API_KEY}`).
   - Note the Agent API uses **`input`** (not `messages`) and a **namespaced model** (`perplexity/sonar`). Map `PERPLEXITY_MODEL` accordingly (accept either `sonar` or `perplexity/sonar`; normalize to the namespaced form for this endpoint).
   - Bump `max_output_tokens` default to ~512 (finance tables are larger than prose answers).
2. **Response parsing.** The response `output[]` array contains one or more `finance_results` items **before** the final `message`:
   - `finance_results[].categories`, `.tickers`, and `.results[].content` (structured markdown tables) + `.results[].sources`.
   - Final `message.content[0].text` = the synthesized summary.
   - Normalize into `ResearchResult`: `summary` = final message text; attach the structured `finance_results` content + sources; capture `tickers` and `categories`. (Extend the `ResearchResult` type if needed to carry the structured payload — update `types.ts` + `schemas.ts`.)
3. **Cost visibility (nice-to-have, keep simple).** The response `usage.cost.total_cost` and `usage.tool_calls_details.finance_search.invocation` are returned. Optionally record real per-call cost alongside the count in `data/research/usage-<date>.json`. The **count-based daily cap stays the hard guardrail**; a daily *cost* cap may be added later.
4. **Config.** Update the in-code default URL to the agent endpoint. `.env.example` already has `PERPLEXITY_API_KEY` / `PERPLEXITY_MODEL` / `PERPLEXITY_DAILY_CALL_CAP`; add an optional `PERPLEXITY_API_URL` override if convenient.
5. **Tests.** Update `research.test.ts` fixtures to the **Agent API response shape** (a `finance_results` item + a final `message`). Re-assert: default-off makes zero calls; cap provably blocks call N+1; a successful call parses structured finance data; non-OK / missing-key fails soft to `null`.

## Unchanged (must remain true)
- Default **off** (`RESEARCH_PROVIDER=off`) → zero API calls.
- Daily cap enforced **before** any request; only successful calls metered.
- **Research/context only — never order pricing or execution** (Alpaca is the source of truth for prices).
- Single sanctioned metered-API exception per `.agents/infra.md`.

## Acceptance
- With a key + `RESEARCH_PROVIDER=perplexity`, a research call hits `/v1/agent` with the `finance_search` tool and returns **structured** finance data parsed into `ResearchResult`.
- Cap still blocks call N+1; `off` still makes zero calls; tests green; typecheck/lint/build clean.

## Out of scope
- Yahoo Finance integration — explicitly **not** added (no official API; 15–20 min delays; no streaming; fragile/ToS-limited). Real-time prices stay on **Alpaca**; if more real-time depth is ever needed, upgrade Alpaca's market-data plan or use a proper provider (e.g. Polygon) — not Yahoo.
