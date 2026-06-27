# Build Spec — reliable, multi-source catalyst & news capture

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/infra.md`, `.agents/data-format.md`, `planning/conviction-honesty-and-catalyst-quality-spec.md` first. From an LLY proposal: the research/catalyst fetch **failed** ("research fetch failed", "No named catalyst recorded"), so the red-team rejected a catalyst-rich, all-time-high breakout (CHMP approvals, Medicare GLP-1 program, analyst target raises) as "catalyst-free." The red-team reasoned correctly on empty inputs — the **data pipeline** is the bug. Each milestone = its own branch + PR._

## Principle
The red-team is only as good as the evidence it's fed. **A failed fetch must never be silently treated as "no catalyst."** Catalyst/news capture must be reliable, multi-source, and verifiable.

## M1 — `feature/catalyst-news-sources`
Make catalyst/news capture multi-source and reliable:
- **Add Alpaca's News API as a primary catalyst source** — free, reliable, Benzinga-powered, no daily cap, already part of the Alpaca integration. Fetch recent headlines for the symbol and extract candidate catalysts (regulatory/FDA/EMA, M&A, earnings, guidance, analyst actions, product/clinical, Medicare/policy). This would have caught the LLY headlines.
- **Keep Perplexity** for the deeper structured fundamentals/earnings/analyst data (within its cap).
- **Retry + fallback chain:** try sources in order; if one fails, fall back to the next. Never emit "no catalyst" because a single source errored.
- **Surface the sources** that informed the catalyst (headline + publisher + timestamp) on the proposal + export, so the catalyst is verifiable.
- The captured catalyst feeds the catalyst checklist item and the red-team prompt (with its sources).
- **Acceptance:** for a catalyst-rich symbol the pipeline captures real catalysts from Alpaca News with sources listed; a failed Perplexity fetch falls back to Alpaca News (not "no catalyst"); the red-team prompt receives the real catalyst + sources; unit-tested with a mock news payload and a simulated source failure.

## M2 — `feature/catalyst-state-honesty`
Distinguish — everywhere (proposal, checklist, red-team prompt, export) — three states, never conflating them:
1. **Catalyst found** (named + sources) → checklist ✓.
2. **Searched, none found** (sources returned, nothing material) → checklist ⚑ "no catalyst found".
3. **Unavailable — fetch failed** → checklist ⚑ "catalyst data unavailable — retry"; the red-team is told the data is **unavailable, not absent**, and must NOT reject for "no catalyst" on a failed fetch. Feeds the conviction penalty (per `conviction-honesty` spec) and, where practical, **retries / flags for re-fetch** rather than shipping a spurious reject.
- **Acceptance:** the three states are distinct in the data + UI + export + red-team prompt; a fetch failure renders "unavailable — retry" (never "no catalyst"); the red-team's rejection basis can't be "no catalyst" when the state is "unavailable"; tested for all three.

## Honest notes
- Even with the catalyst captured, an **extended entry** (chasing a gap into highs, no pullback) is a legitimate trend-discipline flag — a fully-informed verdict may be "concern," not "approve." The goal is rejection (or approval) for the **right reason**, on complete data.
- No Yahoo scraping (per the standing decision) — Alpaca News + Perplexity covers it reliably/legally; a paid news provider is a future option if more depth is needed.

## Out of scope
- Gate/hard-rail/execution changes; making the red-team numeric; Yahoo scraping.
