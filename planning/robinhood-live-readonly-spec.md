# Build Spec — Robinhood live: read-only data + advisory analysis (NO automated execution)

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/infra.md` (two-gate design) first. **Real money is involved. This phase is READ-ONLY + ADVISORY only. The harness order gate stays CLOSED; the agent never places a real order. Automated execution remains gated on a passing `planning/phase-2-evaluation-scorecard.md`.**_

## Context
The user has a funded Robinhood **Agentic** account (~$100, one fractional NVDA position). They want it visible in the dashboard and analyzed/suggested-on — with **manual human execution** (they place trades in Robinhood themselves). Phase 3 M1 (read-only panel) is already built; this connects it to the real account and adds read-only advisory analysis.

## Connection (human-performed — not a build step)
- `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading` → `/mcp` → **user authenticates** (Robinhood login/authorize on desktop). Credentials are never handled by the agent.
- Reading requires **no** trade-gate changes. Leave `ROBINHOOD_BROKER_TRADING_ENABLED` and the `settings.json` order allow-list **as-is (closed)**.

## M1 — `feature/robinhood-live-readonly` — show the real account
- Confirm the existing read-only path writes a **live snapshot** from the MCP `get_portfolio` and the LIVE panel renders the real account (equity, cash, the NVDA fractional position). Add a **live positions** display if one isn't already present (mirror the paper Positions view, clearly labeled LIVE).
- Privacy: the MCP grants read access to all the user's Robinhood accounts — surface only the **Agentic** account; don't aggregate or display the others.
- **Acceptance:** with the MCP connected, the LIVE panel + live positions show the real $100 account and NVDA position; with it disconnected, the existing "not connected" state shows; no trade-gate state changed.

## M2 — `feature/robinhood-advisory` — read-only suggestions on the live account
- Extend the research/proposal pipeline to **read** the live Agentic positions and emit **advisory** proposals for it (reusing the existing thesis + risk-rail + Codex red-team reasoning).
- These live proposals are **advisory only**: clearly tagged `live · advisory · execute manually`, and they **must not route to any execution path** — not the broker, not the dry-run sink. They are guidance the user acts on themselves in Robinhood.
- The Overview "awaiting review" / Proposals views must visually distinguish **live-advisory** proposals from paper proposals, and an advisory proposal's only actions are "mark reviewed / dismiss" — **no Approve-to-execute** button while the gate is closed.
- **Acceptance:** the desk generates advisory proposals against the real account with full reasoning; none can trigger a real or dry-run order; the live-advisory tag is unmistakable; unit test asserts no execution path is reachable from a live-advisory proposal.

## Hard guardrails (non-negotiable)
- Harness order gate stays **closed**; the agent cannot place real orders. Automated execution (opening the gate, M5) remains gated on a passing scorecard — out of scope here.
- Advisory only; not investment advice; the human places every real trade. Funding/withdrawals are human-only.
- Keep the kill switch + read-only posture; nothing here can move money.

## Out of scope
- Opening the harness gate / automated real-money execution (Phase 3 M5, gated).
- Options/crypto/margin.
