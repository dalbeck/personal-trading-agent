/**
 * Tax-lot / holding-period surfacing (tax-awareness M6) — pure, client-safe.
 * **Advisory only**: everything here is a surfaced caution or a review note, never
 * a hard block (consistent with how weak catalysts/targets are flagged, not gated),
 * and there is **no automated lot selection** — the human decides. The functions
 * compute holding period, the long-term/short-term unrealized split, a wash-sale
 * warning, and a "nearly long-term" sell note.
 */

/** The IRS long-term line: a position held longer than this qualifies for
 *  long-term capital-gains treatment. */
export const LONG_TERM_DAYS = 365;
/** The wash-sale window (calendar days before/after a loss sale). */
export const WASH_SALE_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/** Calendar days between two ISO dates (absolute). */
function daysBetween(a: string, b: string): number {
  return Math.abs(Math.floor((Date.parse(b) - Date.parse(a)) / MS_PER_DAY));
}

/** Calendar days a lot has been held as of `asOf` (never negative). */
export function daysHeld(openedAt: string, asOf: string): number {
  const d = Math.floor((Date.parse(asOf) - Date.parse(openedAt)) / MS_PER_DAY);
  return d > 0 ? d : 0;
}

/** Whether a lot is long-term (held more than the 365-day line). */
export function isLongTerm(openedAt: string, asOf: string): boolean {
  return daysHeld(openedAt, asOf) > LONG_TERM_DAYS;
}

export interface TermLot {
  openedAt: string;
  unrealizedPl: number;
}

export interface TermSplit {
  longTermUnrealizedUsd: number;
  shortTermUnrealizedUsd: number;
  longTermPositions: number;
  shortTermPositions: number;
}

/**
 * Split unrealized P&L into long-term vs short-term by holding period. A lot held
 * past the 365-day line is long-term; otherwise short-term. Both gains and losses
 * are bucketed (so the human sees, e.g., "+$1,200 long-term / −$300 short-term").
 */
export function splitUnrealizedByTerm(
  lots: readonly TermLot[],
  asOf: string,
): TermSplit {
  const split: TermSplit = {
    longTermUnrealizedUsd: 0,
    shortTermUnrealizedUsd: 0,
    longTermPositions: 0,
    shortTermPositions: 0,
  };
  for (const lot of lots) {
    if (isLongTerm(lot.openedAt, asOf)) {
      split.longTermUnrealizedUsd += lot.unrealizedPl;
      split.longTermPositions += 1;
    } else {
      split.shortTermUnrealizedUsd += lot.unrealizedPl;
      split.shortTermPositions += 1;
    }
  }
  return split;
}

export interface WashSaleEntry {
  symbol: string;
  action: "buy" | "sell";
  timestamp: string;
  /** For a sell: whether it realized a loss (only loss sells matter to the rule). */
  realizedLoss?: boolean;
}

export interface WashSaleInput {
  symbol: string;
  action: "buy" | "sell";
  /** For a sell proposal: whether the lot being sold is underwater. */
  realizesLoss: boolean;
  asOf: string;
  journal: readonly WashSaleEntry[];
}

export interface WashSaleWarning {
  reason: string;
}

/**
 * Wash-sale warning (advisory). For a **loss-realizing sell**, flag any buy of the
 * same security within 30 days (before or after) — the loss would be disallowed
 * and rolled into the replacement lot's basis. For a **buy**, flag a loss sale of
 * the same security within the prior 30 days — rebuying back into a just-realized
 * loss triggers the rule. Returns null when there's nothing to warn about. This is
 * a surfaced caution, never a block.
 */
export function washSaleWarning(input: WashSaleInput): WashSaleWarning | null {
  const within = (ts: string) => daysBetween(ts, input.asOf) <= WASH_SALE_DAYS;

  if (input.action === "sell" && input.realizesLoss) {
    const recentBuy = input.journal.find(
      (e) => e.symbol === input.symbol && e.action === "buy" && within(e.timestamp),
    );
    if (recentBuy) {
      return {
        reason: `A buy of ${input.symbol} within ${WASH_SALE_DAYS} days may make this loss a wash sale — the loss would be disallowed and added to the replacement lot's cost basis.`,
      };
    }
  }

  if (input.action === "buy") {
    // A past sale's realized P&L often isn't recorded; treat an unknown sale as a
    // POSSIBLE loss (advisory "may"), and skip only a sale known to be a gain.
    const recentLossSale = input.journal.find(
      (e) =>
        e.symbol === input.symbol &&
        e.action === "sell" &&
        e.realizedLoss !== false &&
        within(e.timestamp),
    );
    if (recentLossSale) {
      return {
        reason: `A loss sale of ${input.symbol} within the last ${WASH_SALE_DAYS} days — rebuying now may trigger the wash-sale rule, disallowing that earlier loss.`,
      };
    }
  }

  return null;
}

export interface NearLongTermInput {
  openedAt: string;
  asOf: string;
  /** Whether the lot being sold is at a gain (only a gain converts LT→ST). */
  hasGain: boolean;
  /** How close to the line counts as "nearly long-term". Default 31 days. */
  thresholdDays?: number;
}

/**
 * "Nearly long-term" sell note (advisory). When a **gain** lot is within the
 * threshold of the 365-day line, selling now realizes a *short-term* gain that a
 * short wait would convert to long-term. Returns null otherwise.
 */
export function nearLongTermSellNote(input: NearLongTermInput): string | null {
  const held = daysHeld(input.openedAt, input.asOf);
  const threshold = input.thresholdDays ?? 31;
  const remaining = LONG_TERM_DAYS + 1 - held; // days until long-term qualifies
  if (input.hasGain && held <= LONG_TERM_DAYS && remaining <= threshold && remaining > 0) {
    return `Held ${held} days — ${remaining} short of long-term. Selling now realizes a SHORT-term gain; waiting ~${remaining} day${remaining === 1 ? "" : "s"} would qualify it for long-term treatment.`;
  }
  return null;
}
