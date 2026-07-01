# Design — Fail-closed auth on all mutating API routes (C1)

**Date:** 2026-07-01
**Branch:** `fix/api-auth-fail-closed`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Critical item **C1**.
**Scope decision:** first milestone branch of the eval remediation. C2 (loopback
binding) and all H/medium/charter items are explicit follow-ups.

## Problem

The API has two distinct auth defects:

1. **No auth at all** on money/trade + rail-relaxing routes — `live/approve`,
   `live/approve/precheck`, `risk-settings`, and most mutating routes have no
   token, Origin, or Host check. This exposes them to browser CSRF (the handlers
   read `req.json()` with no Content-Type/preflight requirement), DNS-rebinding
   (no Host check), and to the desk's own headless routine agents, which hold a
   broad `Bash(curl:*)` grant and could `curl -X POST localhost:3000/api/live/approve`.
   The "app never auto-trades" invariant is currently enforced only by LLM
   instruction-following, not by code.

2. **Fail-open token check** on six routes — `red-team`, `routines/[id]`,
   `research/finance`, `news-scout/poll`, `watchlist/discover`, `live/disconnect`
   use the pattern `if (token && authHeader !== ...)`. When
   `ROUTINE_TRIGGER_TOKEN` is **unset**, the guard is skipped entirely →
   anonymous access. The check must fail **closed**.

The correct pattern already exists: `src/app/api/ops/[action]/route.ts` has a
fail-closed `authorize()` (localhost-Host-only → 503 when token unset → Bearer
token OR same-origin browser signal). This design lifts it into a shared module
and applies it everywhere.

## Approach

### 1. Extract `authorize()` into a shared server module

New file `src/lib/server/authorize.ts` — the `authorize(req)` function and
`AuthResult` type moved verbatim from the ops route (no behavior change).
Contract, unchanged:

- **Localhost Host only** — a non-localhost `Host` header → `403` (defense in
  depth atop 127.0.0.1 binding, which is a separate C2 follow-up).
- **Fail closed on unset token** — no `ROUTINE_TRIGGER_TOKEN` → `503` with a
  message telling the operator to set it and restart.
- **CLI caller** — `Authorization: Bearer <token>` matches → ok, else `401`.
- **Browser caller** — same-origin proven by `Sec-Fetch-Site: same-origin`
  (browser-set, forbidden-to-JS) or a same-host `Origin` → ok, else `403`.
- **Neither** → `401`.

Also export a small helper to remove per-route boilerplate:

```ts
export function requireAuthorized(req: Request): Response | null {
  const auth = authorize(req);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}
```

The ops route is refactored to import from the shared module (its inline copy
deleted); its existing tests must stay green, proving the extraction is
behavior-preserving.

### 2. Apply to every mutating route

**Rule:** gate every **non-GET** handler; leave every `GET` handler open. Where
a file has both a read `GET` and a mutating `POST`, only the `POST` is gated. At
the top of each gated handler:

```ts
const denied = requireAuthorized(req);
if (denied) return denied;
```

**POST handlers gated** (verified via method survey):
`allocation-targets`, `chat`, `discovery-settings`, `live/approve/precheck`,
`live/approve`, `live/disconnect`, `live/refresh`, `live/sync-trades`,
`news-scout/poll`, `proposals/[id]/red-team`, `proposals/[id]/refresh-levels`,
`proposals/[id]/refresh-research`, `proposals/[id]/staged-plan`,
`proposals/analyze`, `proposals/review`, `red-team`, `research/finance`,
`risk-settings`, `routines/[id]`, `scanner/run`, `symbol/[ticker]/highlights`,
`symbol/[ticker]/research/refresh`, `watchlist/discover`, `watchlist`.

The **fail-open six** (`red-team`, `routines/[id]`, `research/finance`,
`news-scout/poll`, `watchlist/discover`, `live/disconnect`) get their
`if (token && …)` block **replaced** by the shared call (this closes the
unset-token hole, not just adds a check).

**Left open** (read-only `GET` handlers, per the approved "all mutating" scope):
`market/status`, `proposals/[id]/export`, `regime`,
`symbol/[ticker]/{bars,quote,research/freshness}`, and the `GET` handlers of
`allocation-targets`, `discovery-settings`, `risk-settings`, `watchlist`.

### 3. Narrow the routine `Bash(curl:*)` grant — deferred to a follow-up

Deferred out of this branch (decision 2026-07-01). Key finding: the routine
agents **already hold `$ROUTINE_TRIGGER_TOKEN`** (they curl read/write endpoints
with `Authorization: Bearer $ROUTINE_TRIGGER_TOKEN`), so the code-level auth in
this branch does **not** by itself stop a routine agent from curling
`/api/live/approve` with the token. Narrowing `ROUTINE_ALLOWED_TOOLS`
(`src/lib/server/routine-cli.ts:23`) to an explicit read/write endpoint
allowlist is the real defense-in-depth, but Bash prefix-matching is fragile and
must be validated by actually running the routines (regime, bars,
watchlist/discover, research/finance, news-scout). It gets its own focused
follow-up branch. Until then, the **live gate** remains the boundary: an
approved order lands in the dry-run sink unless a human has separately opened the
gate.

## Behavior after the change

- **Dashboard (same-origin browser):** its own `fetch()` calls carry
  `Sec-Fetch-Site: same-origin` → pass. No UI regression expected.
- **Routine agents (CLI):** already present
  `Authorization: Bearer $ROUTINE_TRIGGER_TOKEN` → pass.
- **Hard cutover risk:** if the running instance has no `ROUTINE_TRIGGER_TOKEN`
  set, **every gated route returns 503** after this lands. This is correct
  fail-closed behavior but requires the operator to set the token in `.env` and
  restart. Called out in the PR description.

## Testing (TDD)

- `src/lib/server/authorize.test.ts` — the four outcomes: no token → 503; bad
  bearer → 401; cross-origin (`Sec-Fetch-Site: cross-site`) → 403; valid bearer
  and same-origin → ok; plus non-localhost Host → 403. Fills the eval's "zero
  auth tests" gap.
- One representative route test (e.g. `live/approve`) asserting: no token → 503
  and no order side effect; valid caller → normal handling. Confirms the guard
  runs before any body parsing / side effect.
- Full suite (`pnpm test`), `pnpm typecheck`, `pnpm lint` stay green.

## Out of scope (follow-up branches)

- **Routine `Bash(curl:*)` narrowing** — deferred (see section 3), needs live
  routine validation.
- **C2** — loopback binding (`next start -H 127.0.0.1`, Caddy `bind 127.0.0.1`).
- **H1–H8**, medium items, and all charter/playbook edits.
