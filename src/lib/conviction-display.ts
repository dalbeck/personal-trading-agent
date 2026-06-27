import type { BadgeTone } from "@/components/ui/badge";
import type { ConvictionTier } from "@/lib/conviction";
import { convictionTierStyle } from "@/lib/conviction-style";
import type { RedTeamVerdict } from "@/lib/types";

/**
 * Verdict-aware presentation for the conviction tier (conviction-honesty M1).
 *
 * Conviction is a **ranking / sort signal, not a verdict** — the red-team verdict
 * is the headline. So the badge is framed as a "signal", and when the matching
 * red-team **rejects** it is never shown reassuringly: it goes **muted** (no
 * accent/green "high") and carries an explicit conflict note ("red-team reject ·
 * ranking only"). This keeps a rejected proposal from reading as a confident buy
 * just because the cheap-and-big-R:R heuristic ranked it high.
 *
 * Pure (no I/O) + unit-tested (`conviction-display.test.ts`).
 */
export interface ConvictionDisplay {
  /** Ranking-signal framing, e.g. "High signal" (never "High conviction"). */
  label: string;
  /** Muted on a red-team reject (never reassuring); else the calm tier gradient. */
  tone: BadgeTone;
  /** True when the matching red-team rejected — surface the tension. */
  conflicted: boolean;
  /** Short conflict note when `conflicted`, else null. */
  note: string | null;
}

const TIER_WORD: Record<ConvictionTier, string> = {
  high: "High",
  moderate: "Moderate",
  watch: "Watch",
};

/**
 * How to display the conviction tier alongside its matching red-team verdict.
 * Returns null for an unscored proposal (no tier).
 */
export function convictionDisplay(
  tier: ConvictionTier | null,
  verdict: RedTeamVerdict["verdict"] | null | undefined,
): ConvictionDisplay | null {
  if (!tier) return null;
  const conflicted = verdict === "reject";
  return {
    label: `${TIER_WORD[tier]} signal`,
    tone: conflicted ? "muted" : convictionTierStyle[tier].tone,
    conflicted,
    note: conflicted ? "red-team reject · ranking only" : null,
  };
}
