# Red Team rules view — design

## Goal
Surface the red-team prosecutor's ruleset on the Strategy page so the human can
see exactly how a proposed trade is judged, without reading code.

## Decisions
- **Read-only, code-derived.** The rules live in code (`buildProsecutorPrompt`),
  not a markdown doc. The view renders a structured module that imports the real
  threshold constants, so the numbers shown can never drift from what the
  prosecutor enforces. Not user-editable.
- **Third tab, read-only.** Added next to Charter/Playbook in the existing tab
  row; no Edit button, no "edits write back" footer when active.
- **Full prosecutor rules.** Shared hard rails, Trend lens, Value lens, and the
  key thresholds — including the two recent fixes (trend volume-confirmed why-now
  precedence, financial-sector leverage caveat).

## Components
1. **`src/lib/red-team-rules.ts`** (new, plain module) — single source of truth.
   - `RED_TEAM_RULE_THRESHOLDS` — numeric thresholds re-exported from the real
     constants: `MIN_REWARD_RISK`, `REL_VOLUME_BREAKOUT_MIN`, and the
     `CASH_FLOW_THRESHOLDS` leverage/coverage/yield floors.
   - `RED_TEAM_RULES` — `{ intro, sections[], thresholds[] }` where each section
     is `{ id, title, summary, rules: string[] }` for shared rails / trend /
     value. Rule prose authored canonically here (mirrors the prompt); threshold
     numbers interpolated from the constants.
2. **`src/lib/risk-reward.ts`** — promote the private `MIN_REWARD_RISK` (today in
   `proposal-builder.ts`) to an exported constant in this pure leaf module so the
   rules module, the prompt builder, and the proposal builder share one number.
3. **`src/lib/server/red-team.ts`** — point the shared-rails "reward/risk ≥ 2:1"
   line at `MIN_REWARD_RISK` so the coupling is real (the volume line already
   uses `REL_VOLUME_BREAKOUT_MIN`).
4. **`src/components/strategy/red-team-rules-view.tsx`** (new) — read-only
   presentational render of `RED_TEAM_RULES`: intro, per-section rule lists, and
   a thresholds grid. Matches the existing card styling; `ScaleIcon` header.
5. **`src/components/strategy-editor.tsx`** — add a "Red Team" tab. When active,
   render `<RedTeamRulesView/>` instead of the editor body and hide the Edit
   button + footer note.

## Testing
- `src/lib/red-team-rules.test.ts`: thresholds equal their source constants
  (drift guard); shared/trend/value sections present and non-empty; the trend
  volume-precedence rule and the financial-sector caveat are present and cite the
  threshold numbers.
- `red-team.test.ts` stays green (the `2:1` text is preserved via interpolation).
- No component tests (repo has none; vitest is node-env). Verify the UI by
  running the app and screenshotting the new tab.

## Out of scope
- Rewriting `buildProsecutorPrompt` sentence-by-sentence. The prompt keeps its
  conditional logic; the module is the human-readable spec of the same rules,
  coupled on the threshold constants.
- A verdict legend (approve/concern/reject) beyond a one-line frame in the intro.
