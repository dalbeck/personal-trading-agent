/**
 * Catalyst capture **state** honesty (catalyst-state-honesty M2). A failed fetch
 * must never read as a real "no catalyst" — the LLY breakout was rejected as
 * "catalyst-free" when the research/news fetch had actually *failed*. These pure
 * helpers translate the three distinct states — **found**, **none** (searched,
 * nothing material), **unavailable** (fetch failed) — into the labels/prose shared
 * by the checklist, the proposal detail view, the export, and the red-team
 * briefing, so the states are never conflated. Pure + unit-tested. Plain module
 * (no `server-only`) so the client view imports it.
 */
import type { CatalystState } from "@/lib/types";

export interface CatalystStateInput {
  catalyst: string | null;
  catalystState?: CatalystState | null;
}

/**
 * The effective catalyst state. Uses the stored state when present; for older
 * records (null state) derives it from catalyst presence — `found` when a
 * catalyst is named, else `none`. It **never fabricates `unavailable`** — only a
 * known failed fetch sets that state at capture time, so a null state can never
 * be mistaken for a failure.
 */
export function resolveCatalystState(input: CatalystStateInput): CatalystState {
  if (input.catalystState) return input.catalystState;
  return input.catalyst ? "found" : "none";
}

/** True only for the fetch-failed state — the one the red-team must NOT treat as
 *  "no catalyst." */
export function isCatalystUnavailable(
  state: CatalystState | null | undefined,
): boolean {
  return state === "unavailable";
}

/** Short detail text for the flagged states (checklist / export). `found` returns
 *  null — the caller renders the catalyst (type) itself. */
export const CATALYST_NONE_DETAIL = "No catalyst found";
export const CATALYST_UNAVAILABLE_DETAIL = "Data unavailable — retry";

export function catalystStateDetail(state: CatalystState): string | null {
  switch (state) {
    case "none":
      return CATALYST_NONE_DETAIL;
    case "unavailable":
      return CATALYST_UNAVAILABLE_DETAIL;
    case "found":
      return null;
  }
}

/** Longer prose for the proposal detail view + export Research section. `found`
 *  returns null — the caller renders the catalyst text. The `unavailable` copy
 *  says **retry** and never says "no catalyst". */
export const CATALYST_NONE_PROSE =
  "No catalyst found — recent news was searched and nothing material came back.";
export const CATALYST_UNAVAILABLE_PROSE =
  "Catalyst data unavailable — the news/research fetch failed. Retry to re-check.";

export function catalystStateProse(state: CatalystState): string | null {
  switch (state) {
    case "none":
      return CATALYST_NONE_PROSE;
    case "unavailable":
      return CATALYST_UNAVAILABLE_PROSE;
    case "found":
      return null;
  }
}
