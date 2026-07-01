# Codebase Evaluation — 2026-07-01

Full review of the desk: red-team subsystem, risk/execution safety, charter + playbooks + routines, and general code quality. Typecheck passes (0 errors), lint passes (3 unused-var warnings in `red-team-sweep.test.ts`), ~120 co-located test files. Vitest could not run in the review sandbox (macOS-installed native bindings); run locally to confirm green.

**Overall verdict:** well above average for a personal project. The lib/server split, zod contracts on every artifact, fail-closed red-team, tripwired charter constants, and deterministic execution pipeline are genuinely good engineering. The gaps cluster in four places: **unauthenticated order-approval endpoints**, **safety rails that silently fail open in degraded conditions**, **red-team briefings that drop the mandate lens on most call paths**, and **charter promises the code doesn't keep** (live drawdown kill, broker-side stops).

---

## Critical — fix before anything else

### C1. The approve endpoint has no authentication; routine agents can hit it
`/api/live/approve`, `/precheck`, and `/api/risk-settings` have no token, Host, or origin check (contrast `/api/ops/[action]`, which does all three and fails closed). Consequences:

- Any website in your browser can CSRF a preflight-free POST to it (`req.json()` ignores Content-Type).
- DNS rebinding reaches it (no Host check).
- Your own headless routine agents have `Bash(curl:*)` allow-listed (`routine-cli.ts:23`) and could `curl -X POST localhost:3000/api/live/approve` — the "app never auto-trades" invariant is enforced only by LLM instruction-following, not code.
- An attacker/agent can first relax rails via unauthenticated `/api/risk-settings`, then approve with an override comment that bypasses red-team + rails + live caps in one shot.

**Fix:** apply the ops-route `authorize()` (fail-closed 503 when token unset, localhost Host check, same-origin) to approve, precheck, risk-settings, disconnect/reconnect, and every other mutating route. Narrow the routine Bash grant to specific curl targets. Also fix the pervasive fail-open pattern `if (token && ...)` on `/api/red-team`, `/api/routines/[id]`, `/api/research/finance`, `/api/news-scout/poll`, `/api/watchlist/discover` — unset token currently means anonymous access.

### C2. Server binds all interfaces; Caddy adds a LAN path
`next start` has no `-H 127.0.0.1` (start-server.sh claims loopback but doesn't enforce it), and the Caddyfile binds :80 on all interfaces, reverse-proxying by Host header to every unauthenticated route above. **Fix:** `next start -H 127.0.0.1` and `bind 127.0.0.1` in the Caddy site block.

---

## High

### H1. The live drawdown kill switch can never fire
`buildLiveSnapshot` hardcodes `equityCurve: []` (robinhood.ts:275), so `liveDrawdown` computes high-water = current equity → drawdown is always 0. The charter's advertised −10% live kill is dead code; the same defect neuters the `drawdown-halt` rail for live approvals. **Fix:** persist live equity history (or a high-water file) and feed it in. Note it also only runs inside `refreshLiveAccount` — evaluate it on the approval path too.

### H2. Rails fail open when no snapshot exists
`evaluateApprovalBlocks` (live-order.ts:484) skips ALL rail checks if the book's snapshot is missing/unreadable — no size, sector, count, drawdown, or emergency-stop evaluation. **Fix:** treat "no snapshot" as a blocking violation on the approval path.

### H3. Red-team briefings drop the lens on 4 of 6 call sites
`buildProsecutorPrompt` picks the lens from `strategy`/`sleeve`, but the re-run route, the approval-time fallback (`toRedTeamProposal`, live-order.ts:433), the sweep, and the paper batch each drop `strategy` and/or `sleeve` plus value-briefing fields (`cashFlow`, `dividend`, `catalystState`, `targetWeightPct`...). Result: value proposals re-judged under the trend lens ("counter-trend is a strike"), core-long proposals hit the "missing stop" strike → spurious rejects that systematically kill valid value/core proposals and defeat the charter's "never merge the lenses" design. Only `analyze-symbol.ts` and `refresh-levels.ts` pass the full briefing. **Fix:** one shared, tested `toRedTeamProposal()` mapper used by all six call sites, plus a field-completeness test.

### H4. Red-team verdicts are never invalidated
The stored verdict has no timestamp or content hash; approval reuses it (`order.redTeam ?? runRedTeam(...)`) however old, and editing a thesis doesn't clear it. **Fix:** stamp `judgedAt` + a hash of the judged fields; treat mismatch or age > N hours as "no verdict" (re-run, fail closed); null `redTeam` on any proposal edit.

### H5. Prosecutor CLIs are spawned unsandboxed with untrusted text in the prompt
Thesis, research, and third-party **news headlines** are interpolated raw into the prosecutor prompt, and `codex exec` / `claude -p` run with no tool/sandbox restrictions in the repo cwd (contrast `buildPlaceOrderCliCommand`, which pins allowed tools). An injected instruction in a headline could drive the judge's tools or dictate `{"verdict":"approve"}`. **Fix:** `codex exec --sandbox read-only -a never`, `claude -p` with tools disabled and a non-repo cwd; fence untrusted fields as data-not-instructions; length-cap headlines.

### H6. Live orders: no broker-side stop, no idempotency, LLM-mediated placement
- The Robinhood path places only the entry limit — `stopPrice`/`takeProfit` exist only in the journal, and nothing monitors live positions against stops intraday. The charter's "stop on every entry" is unenforced exactly where real money is.
- No client order id goes to Robinhood; a timeout after placement + retry = duplicate live order (Alpaca path does this right).
- Placement is a natural-language prompt trusting the model to call `place_equity_order` exactly once with the right numbers; `order.symbol` is interpolated unsanitized.

**Fix:** place the stop after fill (or build a stop-monitor routine), reconcile via `get_equity_orders` before any retry, sanitize symbol (`^[A-Z][A-Z0-9.\-]{0,9}$`), and long-term replace the LLM hop with a direct API/MCP call.

### H7. Duplicate-order paths
- **Tranche fallback:** an already-filled or invalid tranche index "falls back to full-position approve" under a different idempotency key (approve/route.ts:121–135) — a lagged re-tap of tranche 1 can place 4/3 of the intended position. The test at route.test.ts:204 enshrines this. **Fix:** 409 instead of falling back.
- **Paper batch never marks proposals executed:** `executePendingProposals` never calls `setProposalStatus`, so a re-fired market-open routine re-places everything, and the human can also approve the same proposal via the live path (no shared idempotency). **Fix:** flip status after placement; share placed-order records.

### H8. No atomic writes + no locking in the data layer
Every persist is a bare `writeFile` (writers.ts, cache.ts, usage.ts — the "atomically-ish" comment is aspirational); readers fail loudly on partial JSON, and one corrupt proposal file bricks `readProposals()` → the whole dashboard and approval flow. The good `lockfile.ts` module is used only by the routines route; `setProposalStatus`/`setProposalRedTeam`/`overwriteProposal` are unprotected read-modify-write (a sweep stamping a verdict can silently overwrite a concurrent status change). Same TOCTOU on the Perplexity daily-cap counter (can overspend the metered API). **Fix:** one `atomicWrite()` helper (tmp + rename) used everywhere; route proposal mutations through `withLock`; skip-and-report bad files on list reads instead of throwing.

---

## Medium

- **Concern verdict unenforced on the live path.** The rules page says concern = reduced size; only the paper batch halves qty. The human-approval path places concern orders at full size silently (live-order.ts:695). Enforce or fix the prose.
- **One override comment bypasses everything at once** — red-team + rails + live caps together, though the spec calls the live caps "hard guardrails (unchanged)". Make `live-max-exposure`/`live-funded-cap` non-overridable like stale-levels, or require per-block acknowledgement.
- **Hard rails inside the red-team are LLM arithmetic.** R:R ≥ 2:1, stop presence, and volume confirmation are checked by prompt instruction, not code. Compute them deterministically before spawning and inject the results (or short-circuit in code).
- **The prosecutor is data-blind.** It sees only the proposal's own fields — no earnings date, no ADV/liquidity, no current book (so no sector-overlap or duplicate-thesis check), no `pricedAt`/`researchAt`. Its "event risk / crowding" attacks are knowledge-cutoff guesses. Enrich the briefing with deterministic facts the desk already has, and add code pre-checks for the binary ones (earnings within N days for swing, qty > x% ADV).
- **A prosecutor outage becomes a sticky reject.** `runRedTeam` failing closed is right, but the sweep persists that reject and skips the proposal forever; the practical remedy becomes a human override — converting fail-closed into traded-with-zero-review. Mark error verdicts distinctly, retry them, and refuse override on an error verdict without a real re-run.
- **Committed harness deny-list has wrong tool ids** — `.claude/settings.json` denies `mcp__robinhood__*` but the server is `robinhood-trading`; the deny-wins layer and the kill switch's "deny always wins" claim are currently ineffective. Human edit required.
- **Kill-switch halt file ignores `TRADING_DATA_DIR`** (kill-switch.sh writes `ROOT/data/...` without sourcing `.env`); with a relocated data dir, step 1 latches nothing. Otherwise the kill switch is solid.
- **Fail-soft market data quietly removes guards on the live path:** no Alpaca quote → stale-levels guard never fires; SPY/VIX fetch failure → emergency stop can't fire; unknown sector → concentration rail skipped. Individually documented, jointly a degraded environment approves orders with the fewest checks. Fail closed (or require override) on the live path.
- **No fill lifecycle.** Journals record `price: limitPrice` as if fully filled; partial fills / non-fills / after-hours day orders are never reconciled against broker state, so subsequent risk context is wrong. Build a post-trade reconciliation pass.
- **Order counter races.** `incrementOrdersToday` is unlocked read-modify-write shared across two processes, and increments are `catch(() => {})` best-effort — the ≤6/day cap can admit a 7th.
- **Prompt-injection into conviction ranking.** Perplexity-derived free text (`catalyst`, `summary`) flows into conviction scoring → queue order, and into journals/red-team prompts, stored verbatim. Length-cap and character-allowlist catalyst phrases; tag LLM-derived text as untrusted downstream.
- **Stray dev scripts inside `data/`** (`tmp-count.py` with a hardcoded Mac path, `tmp-disc.sh`, `.tmp-*.sh`, `_routine_tmp/`, `locks/rt.sh`) ship to the encrypted R2 backup forever. Delete and add `--exclude` patterns to backup.sh.

---

## Charter, playbooks, and routines

The documents themselves are unusually disciplined — change-log rigor, code-mirrored numbers with tripwire tests, clean lens separation, review-only discovery. Improvements:

1. **Charter promises the code doesn't keep.** The −10% live drawdown kill (H1), broker-side stop on every entry (H6), and the unconditional SPY/VIX emergency stop (fail-soft, above) are all written as enforced facts. Either fix the code (preferred) or add honest "known gaps" caveats — a constitution that overstates enforcement trains false confidence at review time.
2. **Shorts are unaddressed.** `TradeProposalSchema` supports `side: "short"`, but the charter never mentions short selling — and "no margin" should logically prohibit it. State it explicitly and reject `side: "short"` in the risk engine.
3. **Quantify the earnings blackout.** "Imminent earnings binary" for swing has no number, and the prosecutor is never told the earnings date anyway. Define N days (e.g. no swing entries within 5 trading days of earnings), feed the date into the briefing, enforce deterministically.
4. **Trend-target contradiction.** Charter Analytical identity: the trend target is *always technically anchored* (prior high / measured move / ATR). Playbook checklist item 9 permits `fundamental` targets in the default (trend) checklist. `fundamental` should be value/mid-sleeve-appropriate only; fix the playbook line.
5. **Core-long and position-mid checklists are prose sketches**, not enumerated checklists like the trend one, and the Strategy page's red-team rules view omits both lenses entirely (only shared/trend/value are shown, while claiming to be "read live from the prosecutor's logic"). Enumerate the checklists; add the two lenses to `RED_TEAM_RULES` with drift-guard tests.
6. **No proposal-expiry rule.** `data/proposals/` already holds 40+ files, many stale manual ones. Only price drift is guarded. Add a charter rule: pending proposals expire after N days (or at `reviewByDate`) and drop to an `expired` status.
7. **Missing discipline rules worth adding:** a re-entry cooldown after a stop-out (revenge-trading guard), a max-consecutive-loss circuit breaker (e.g. 3 straight losers → new-entry pause pending review), and a time-stop rule for what happens when `reviewByDate` passes without action.
8. **Value-sleeve "quality" is unquantified.** "Profitable, durable business, sound balance sheet" gives the LLM and red-team nothing checkable. Add minimum bars (e.g. positive TTM FCF, net debt/EBITDA < 3, no dividend cut in 12 months) so value-trap hunting has teeth.
9. **Sector rail is bypassable by omission.** It fails open on unknown sector, and `sector` is set by the discovery LLM. Make `sector` required on buy proposals (validation, not vibes) so the 40% cap can't be skipped by leaving the field null.
10. **Banked-lesson provenance.** The playbook requires date + source tags; two of three banked lessons have neither. Backfill or re-promote them properly.
11. **Routines are well designed** (deterministic execution and snapshot refresh, headless role-override headers, Alpaca-only pricing, skip-don't-fabricate rules). The one structural issue is C1's: routine agents hold `Bash(curl:*)`, which reaches the unauthenticated approve endpoint — the routines' "you never place orders" is instruction-only until the endpoints authenticate.

---

## Low / hygiene

- Symbol pattern admits `"."`/`".."` (`symbol.ts:12`) — require a leading alphanumeric.
- `uniquePath` and `releaseLock` have small TOCTOU races; use `{flag:"wx"}`.
- `recordNewsItems` silently discards a corrupt day-file (transient read error erases the day's news); distinguish ENOENT from parse failure.
- `extractJsonObject` first-`{`-to-last-`}` slice breaks on two JSON objects (fails closed, but a balanced-candidate retry would cut false rejects); `spawnExec` should escalate SIGTERM → SIGKILL.
- `blocked-caps` returns `dryRun: false` though nothing was placed; `nowET()` returns UTC despite the name.
- `.superpowers/` relies on an inner `.gitignore`; add it to the root ignore. `run-routine.sh`/`r2-common.sh` export the entire `.env` to child processes — extract only needed vars.
- `.env` is correctly NOT committed; `data/` correctly ignored; scripts are unusually good shell overall.
- Test gaps mirror the findings: zero auth tests (nothing to test), route.test.ts:204 enshrines the tranche fallback bug, no realistic-live-snapshot drawdown test, no batch double-place test, one sweep test expectation (`toHaveBeenCalledWith` without `model`) looks like it should fail — verify locally.

---

## Prioritized action list

1. **Auth + binding (C1, C2)** — fail-closed `authorize()` on all mutating routes; loopback binding; narrow routine curl grants.
2. **Fix dead/fail-open safety code (H1, H2, emergency-stop fail-soft)** — live drawdown history, block on missing snapshot, fail closed on missing quotes for live.
3. **Unify red-team mappers + verdict invalidation (H3, H4)** — one tested `toRedTeamProposal()`, content-hash + timestamp on verdicts.
4. **Kill duplicate-order paths (H7)** — 409 on filled tranche, mark batch-executed proposals, shared idempotency records.
5. **Broker-side stops + reconciliation before opening the gates (H6, fill lifecycle)**.
6. **Sandbox the prosecutor spawns (H5)** and correct the `.claude/settings.json` deny ids.
7. **Atomic writes + locking (H8)**.
8. **Charter/playbook edits** — shorts, earnings blackout N, trend-target fix, proposal expiry, sleeve checklists + rules-view lenses, value-quality bars, required sector.
