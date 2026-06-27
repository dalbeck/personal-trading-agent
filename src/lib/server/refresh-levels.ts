import "server-only";

import {
  getLatestPrice,
  getStockBars,
  hasAlpacaCredentials,
} from "@/lib/server/alpaca";
import { rangeWindow } from "@/lib/server/symbol";
import { overwriteProposal, readProposalById } from "@/lib/server/writers";
import {
  defaultSnapshot,
  draftToLens,
  redTeamInput,
} from "@/lib/server/analyze-symbol";
import { runRedTeam, type RedTeamExec } from "@/lib/server/red-team";
import {
  buildManualProposalDraft,
  type BuilderCatalystType,
  type ManualProposalDraft,
} from "@/lib/proposal-builder";
import { TradeProposalSchema } from "@/lib/schemas";
import { assessDividendFloor } from "@/lib/dividend";
import { hasCashFlowData } from "@/lib/cash-flow";
import type { Ohlc } from "@/lib/indicators";
import type { Strategy } from "@/lib/strategy";
import type { ProposalLensBreakdown, TradeProposal } from "@/lib/types";

/**
 * "Refresh levels" re-anchor (fresh-entry-levels M1). The desk's correctness fix:
 * a proposal's entry/stop/target/sizing must track the **current** Alpaca quote,
 * not the price at the original analysis. This recomputes every lens's levels off
 * a fresh quote, re-runs each lens's red-team (the prior verdict judged the stale
 * entry), updates `pricedAt`, and overwrites the SAME proposal in place — it does
 * NOT re-fetch metered research (the narrative is reused) and mints no new id.
 *
 * It places nothing — it only rewrites the review candidate. The per-trade gated
 * approval is unchanged. Seams are injectable so it is unit-tested offline.
 */

export interface RefreshLevelsOpts {
  now?: () => Date;
  dataDir?: string;
  fetchBars?: (symbol: string) => Promise<Ohlc[]>;
  fetchQuote?: (symbol: string) => Promise<number | null>;
  readSnapshot?: (
    account: "paper" | "live",
  ) => Promise<{ equity: number } | null>;
  redTeamExec?: RedTeamExec;
}

export type RefreshLevelsResult =
  | { ok: true; proposal: TradeProposal; quote: number }
  | {
      ok: false;
      code: "not-found" | "no-quote" | "no-snapshot" | "insufficient-data";
      error: string;
    };

const ONE_YEAR_BARS = (symbol: string, now: Date): Promise<Ohlc[]> =>
  getStockBars(symbol, rangeWindow("1Y", now)).catch(() => []);

/** Which mandates the proposal carries — both for a dual-lens manual analyze,
 *  else just its single (top-level) strategy. */
function strategiesOf(p: TradeProposal): Strategy[] {
  const lenses = p.lenses ?? [];
  return lenses.length > 0
    ? lenses.map((l) => l.strategy)
    : [p.strategy];
}

export async function refreshProposalLevels(
  proposalId: string,
  opts: RefreshLevelsOpts = {},
): Promise<RefreshLevelsResult> {
  const now = opts.now?.() ?? new Date();
  const dataDir = opts.dataDir;

  const proposal = await readProposalById(proposalId, { dataDir });
  if (!proposal) {
    return { ok: false, code: "not-found", error: "Unknown proposal." };
  }

  const fetchBars =
    opts.fetchBars ??
    ((s: string) =>
      hasAlpacaCredentials() ? ONE_YEAR_BARS(s, now) : Promise.resolve([]));
  const fetchQuote =
    opts.fetchQuote ??
    ((s: string) =>
      hasAlpacaCredentials()
        ? getLatestPrice(s).catch(() => null)
        : Promise.resolve(null));
  const readSnapshot = opts.readSnapshot ?? defaultSnapshot;

  const [bars, quote, snapshot] = await Promise.all([
    fetchBars(proposal.symbol),
    fetchQuote(proposal.symbol),
    readSnapshot(proposal.account),
  ]);

  if (quote == null || !(quote > 0)) {
    return {
      ok: false,
      code: "no-quote",
      error: `Couldn't read a current Alpaca quote for ${proposal.symbol} — levels left unchanged. Prices are Alpaca-only.`,
    };
  }
  if (!snapshot) {
    return {
      ok: false,
      code: "no-snapshot",
      error: `No ${proposal.account} snapshot to size against. Refresh the account first.`,
    };
  }

  // Rebuild each mandate's draft off the FRESH quote, reusing the proposal's
  // existing research narrative (sector / catalyst) — no new metered call.
  const shared = {
    symbol: proposal.symbol,
    bars,
    quote,
    equity: snapshot.equity,
    sector: proposal.sector,
    catalyst: proposal.catalyst,
    catalystType: (proposal.catalystType ?? null) as BuilderCatalystType | null,
  };
  // Preserve the existing per-lens cash-flow quality + dividend signals
  // (value-cashflow / dividend-floor M1) across a level re-anchor — they are
  // research data, not price levels, so refreshing the levels must not wipe them.
  // Looked up by strategy from the prior lens (or the top-level mirror).
  const existingCashFlow = (strategy: Strategy) => {
    const lens = (proposal.lenses ?? []).find((l) => l.strategy === strategy);
    if (lens) return lens.cashFlow ?? null;
    return proposal.strategy === strategy ? proposal.cashFlow ?? null : null;
  };
  const existingDividend = (strategy: Strategy) => {
    const lens = (proposal.lenses ?? []).find((l) => l.strategy === strategy);
    if (lens) return lens.dividend ?? null;
    return proposal.strategy === strategy ? proposal.dividend ?? null : null;
  };
  const existingResearchStatus = (strategy: Strategy) => {
    const lens = (proposal.lenses ?? []).find((l) => l.strategy === strategy);
    if (lens) return lens.researchStatus ?? null;
    return proposal.strategy === strategy ? proposal.researchStatus ?? null : null;
  };
  // Preserve the catalyst's sources (catalyst-news-sources M1) across a refresh —
  // they are news evidence, not price levels, so re-anchoring must not wipe them.
  const existingCatalystSources = (strategy: Strategy) => {
    const lens = (proposal.lenses ?? []).find((l) => l.strategy === strategy);
    if (lens) return lens.catalystSources ?? [];
    return proposal.strategy === strategy ? proposal.catalystSources ?? [] : [];
  };
  // Preserve the catalyst capture state (catalyst-state-honesty M2) across a
  // refresh — found / none / unavailable is research state, not a price level.
  const existingCatalystState = (strategy: Strategy) => {
    const lens = (proposal.lenses ?? []).find((l) => l.strategy === strategy);
    if (lens) return lens.catalystState ?? null;
    return proposal.strategy === strategy ? proposal.catalystState ?? null : null;
  };

  const strategies = strategiesOf(proposal);
  const drafts = strategies.map((strategy) => {
    // Keep the dividend floor's conviction contribution stable across a refresh.
    const floor =
      strategy === "value"
        ? assessDividendFloor(existingDividend("value"))
        : null;
    return buildManualProposalDraft({
      ...shared,
      strategy,
      ...(floor
        ? { dividendFloor: { covered: floor.covered, atRisk: floor.atRisk } }
        : {}),
      // Preserve the unknown-cash-flow conviction penalty across a refresh.
      ...(strategy === "value"
        ? { qualityDataKnown: hasCashFlowData(existingCashFlow("value")) }
        : {}),
    });
  });
  if (drafts.some((d) => d === null)) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to re-anchor ${proposal.symbol}.`,
    };
  }
  const builtDrafts = drafts as ManualProposalDraft[];

  // Re-run each lens's red-team — the prior verdict judged the stale entry.
  const verdicts = await Promise.all(
    builtDrafts.map((d) =>
      runRedTeam(
        redTeamInput(
          d,
          existingCashFlow(d.strategy),
          existingDividend(d.strategy),
          existingResearchStatus(d.strategy),
          existingCatalystSources(d.strategy),
          existingCatalystState(d.strategy),
        ),
        { exec: opts.redTeamExec },
      ),
    ),
  );

  const dual = (proposal.lenses ?? []).length > 0;
  const lenses: ProposalLensBreakdown[] = dual
    ? builtDrafts.map((d, i) =>
        draftToLens(
          d,
          verdicts[i],
          existingCashFlow(d.strategy),
          existingDividend(d.strategy),
          existingResearchStatus(d.strategy),
          existingCatalystSources(d.strategy),
          existingCatalystState(d.strategy),
        ),
      )
    : [];

  // The active (top-level) lens mirrors the higher-conviction draft (tie → the
  // first / trend), matching the analyze pipeline's default.
  let activeIdx = 0;
  for (let i = 1; i < builtDrafts.length; i++) {
    if (builtDrafts[i].convictionScore > builtDrafts[activeIdx].convictionScore) {
      activeIdx = i;
    }
  }
  const active = builtDrafts[activeIdx];

  const updated: TradeProposal = TradeProposalSchema.parse({
    ...proposal,
    // Re-anchored levels from the active draft (top-level mirror).
    strategy: active.strategy,
    qty: active.qty,
    limitPrice: active.limitPrice,
    stopPrice: active.stopPrice,
    takeProfit: active.takeProfit,
    targetType: active.targetType,
    relativeVolume: active.relativeVolume,
    convictionScore: active.convictionScore,
    convictionTier: active.convictionTier,
    riskPct: active.riskPct,
    confidence: active.confidence,
    thesis: active.thesis,
    reasoning: active.reasoning,
    redTeam: verdicts[activeIdx],
    lenses,
    // Top-level cash-flow + dividend + research status + catalyst state mirror the
    // active lens (preserved on refresh — research data, not price levels).
    cashFlow: existingCashFlow(active.strategy),
    dividend: existingDividend(active.strategy),
    researchStatus: existingResearchStatus(active.strategy),
    catalystState: existingCatalystState(active.strategy),
    // Stamp the new anchor time so the freshness indicator + staleness guard reset.
    pricedAt: now.toISOString(),
  });

  const written = await overwriteProposal(updated, { dataDir });
  if (!written) {
    return { ok: false, code: "not-found", error: "Could not persist refreshed levels." };
  }
  return { ok: true, proposal: updated, quote };
}
