import "server-only";

import { createHash } from "node:crypto";
import { RED_TEAM_VERDICT_TTL_HOURS } from "@/lib/red-team-model";
import { sleeveToStrategy, type Sleeve } from "@/lib/sleeves";
import type { Strategy } from "@/lib/strategy";
import type {
  CashFlowQuality,
  CatalystSource,
  CatalystState,
  DividendSignals,
  RedTeamVerdict,
  ResearchStatus,
} from "@/lib/types";
import type { RedTeamProposal } from "./red-team";

/**
 * The structural briefing source for the red-team prosecutor. Both a
 * `TradeProposal` and an (enriched) `ApprovalOrder` satisfy it, so every call
 * site can brief the prosecutor through the one shared {@link toRedTeamProposal}
 * mapper instead of building the object inline and silently dropping fields.
 *
 * Adding a field here (and to `RedTeamProposal`) without wiring it in
 * `toRedTeamProposal` is caught by `red-team-briefing.test.ts`.
 */
export interface RedTeamBriefingSource {
  symbol: string;
  action: "buy" | "sell";
  side: "long" | "short";
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  thesis: string;
  reasoning?: string;
  research?: string;
  /** Legacy mandate; used with `sleeve` to resolve the prosecutor's lens. */
  strategy?: Strategy | null;
  /** The sleeve; takes precedence over `strategy` when resolving the lens. */
  sleeve?: Sleeve | null;
  targetType?: string | null;
  relativeVolume?: number | null;
  catalyst?: string | null;
  catalystType?: string | null;
  sector?: string | null;
  catalystSources?: CatalystSource[] | null;
  catalystState?: CatalystState | null;
  targetWeightPct?: number | null;
  reviewTriggerPct?: number | null;
  /** Value-lens-only briefing (value-cashflow / dividend-floor / research
   *  unavailable). Passed to the prosecutor for the value lens only. */
  cashFlow?: CashFlowQuality | null;
  dividend?: DividendSignals | null;
  researchStatus?: ResearchStatus | null;
}

/** True when the briefing's lens is the value mandate. Mirrors the resolution in
 *  `buildProsecutorPrompt`: the sleeve wins over the legacy `strategy`. */
function isValueLens(src: RedTeamBriefingSource): boolean {
  const strategy = src.sleeve ? sleeveToStrategy(src.sleeve) : src.strategy;
  return strategy === "value";
}

/**
 * The single briefing mapper. Copies every prosecutor-relevant field and applies
 * the charter's lens separation: the value-only quality signals (`cashFlow`,
 * `dividend`, `researchStatus`) are briefed for the value lens ONLY — never
 * merged into a trend judgment. Used by the sweep, paper batch, re-run route,
 * approval fallback, and the ad-hoc red-team route so none of them drop the lens
 * or the value briefing.
 */
export function toRedTeamProposal(src: RedTeamBriefingSource): RedTeamProposal {
  const value = isValueLens(src);
  return {
    symbol: src.symbol,
    action: src.action,
    side: src.side,
    strategy: src.strategy ?? undefined,
    sleeve: src.sleeve ?? null,
    qty: src.qty,
    limitPrice: src.limitPrice,
    stopPrice: src.stopPrice,
    takeProfit: src.takeProfit,
    targetWeightPct: src.targetWeightPct ?? null,
    reviewTriggerPct: src.reviewTriggerPct ?? null,
    targetType: src.targetType ?? null,
    relativeVolume: src.relativeVolume ?? null,
    catalyst: src.catalyst ?? null,
    catalystType: src.catalystType ?? null,
    sector: src.sector ?? null,
    catalystSources: src.catalystSources ?? null,
    catalystState: src.catalystState ?? null,
    // Value lens only — never bleed value quality into a trend judgment.
    cashFlow: value ? src.cashFlow ?? null : null,
    dividend: value ? src.dividend ?? null : null,
    researchStatus: value ? src.researchStatus ?? null : null,
    thesis: src.thesis,
    reasoning: src.reasoning,
    research: src.research,
  };
}

/* ----------------------- verdict invalidation (H4) ------------------------ */

/**
 * The judged fields whose change should invalidate a verdict, in fixed order and
 * null-normalized so the hash is canonical regardless of key order.
 *
 * Deliberately the **mapper-stable core identity** of the trade: the fields that
 * BOTH briefing mappers (`redTeamInput` at analyze/refresh time and
 * `toRedTeamProposal` at approval/sweep time) populate identically for an
 * unchanged proposal. Fields one mapper omits (`sleeve`, `targetWeightPct`,
 * `reviewTriggerPct`) or value-gates differently (`cashFlow`, `dividend`) are
 * excluded — including them would make an unchanged proposal hash-mismatch across
 * mappers and re-run on every approval. Those briefing inputs only change via
 * `refresh-research` / `refresh-levels`, which already re-run the prosecutor, so
 * the TTL + these core fields are the guard that matters.
 */
function verdictHashInput(b: RedTeamProposal): string {
  // Fixed positions ARE the canonical order; null-normalize undefined.
  const fields: unknown[] = [
    b.symbol,
    b.action,
    b.side,
    b.qty,
    b.limitPrice,
    b.stopPrice,
    b.takeProfit,
    b.targetType,
    b.strategy,
    b.thesis,
  ].map((v) => (v === undefined ? null : v));
  return JSON.stringify(fields);
}

/** A canonical hash of a briefing's judged fields (H4). Two structurally-equal
 *  briefings hash identically; any change to a judged field changes the hash. */
export function redTeamVerdictHash(briefing: RedTeamProposal): string {
  return createHash("sha1").update(verdictHashInput(briefing)).digest("hex");
}

/**
 * Whether a stored verdict may still be trusted for the given briefing (H4).
 * False when the verdict's `judgedHash` is missing or no longer matches the
 * briefing (a judged field changed), its `judgedAt` is missing/unparseable, or
 * its age exceeds the TTL. A stale verdict must be re-run (fail closed).
 */
export function isVerdictFresh(
  verdict: Pick<RedTeamVerdict, "judgedAt" | "judgedHash">,
  briefing: RedTeamProposal,
  opts?: { now?: string; ttlHours?: number },
): boolean {
  if (!verdict.judgedHash || verdict.judgedHash !== redTeamVerdictHash(briefing)) {
    return false;
  }
  if (!verdict.judgedAt) return false;
  const judgedMs = Date.parse(verdict.judgedAt);
  if (!Number.isFinite(judgedMs)) return false;
  const nowMs = opts?.now ? Date.parse(opts.now) : Date.now();
  if (!Number.isFinite(nowMs)) return false;
  const ttlMs = (opts?.ttlHours ?? RED_TEAM_VERDICT_TTL_HOURS) * 3_600_000;
  return nowMs - judgedMs <= ttlMs;
}
