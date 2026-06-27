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
  deriveProposalFromResearch,
  fetchResearchContext,
  type ResearchContext,
} from "@/lib/server/analyze-symbol";
import type { RedTeamExec } from "@/lib/server/red-team";
import type { Ohlc } from "@/lib/indicators";
import type { TradeProposal } from "@/lib/types";

/**
 * "Refresh research" rebuild (proposal-refresh-rebuilds M3). A stored proposal is
 * a frozen snapshot — re-fetching the symbol's research cache (the old behavior)
 * updated the freshness label but left the proposal's stored cashFlow / dividend
 * / catalyst / conviction / red-team STALE, so the user could approve a pre-fix
 * snapshot that still read "data unavailable" while the badge said "fresh".
 *
 * This forces a fresh research fetch and **re-derives** the value-lens fields from
 * it via the SAME `deriveProposalFromResearch` the manual analyze pipeline uses —
 * then overwrites the proposal in place (same id, preserving its lifecycle
 * status/origin/account/advisory) and stamps a new `researchAt`. Levels are also
 * re-anchored to the fresh quote (a rebuild is a full re-analysis), so `pricedAt`
 * advances too. It places nothing and touches no order path. LOCAL.
 *
 * Scoped to **manual-request** (dual-lens) proposals — the analyze-a-symbol output
 * this milestone targets. A non-manual proposal is reported `not-rebuildable` so
 * a single-lens discovery/advisory record is never silently reshaped into the
 * dual-lens manual contract.
 */

export interface RefreshResearchOpts {
  now?: () => Date;
  dataDir?: string;
  fetchBars?: (symbol: string) => Promise<Ohlc[]>;
  fetchQuote?: (symbol: string) => Promise<number | null>;
  /** Injectable research seam (tests bypass the network). Defaults to a FORCED
   *  fetch — a deliberate metered re-spend (the daily cap still gates it). */
  fetchResearch?: (symbol: string) => Promise<ResearchContext>;
  readSnapshot?: (account: "paper" | "live") => Promise<{ equity: number } | null>;
  redTeamExec?: RedTeamExec;
}

export type RefreshResearchResult =
  | { ok: true; proposal: TradeProposal; researchAt: string }
  | {
      ok: false;
      code: "not-found" | "not-rebuildable" | "no-snapshot" | "insufficient-data";
      error: string;
    };

const ONE_YEAR_BARS = (symbol: string, now: Date): Promise<Ohlc[]> =>
  getStockBars(symbol, rangeWindow("1Y", now)).catch(() => []);

export async function refreshProposalResearch(
  proposalId: string,
  opts: RefreshResearchOpts = {},
): Promise<RefreshResearchResult> {
  const now = opts.now?.() ?? new Date();
  const dataDir = opts.dataDir;

  const proposal = await readProposalById(proposalId, { dataDir });
  if (!proposal) {
    return { ok: false, code: "not-found", error: "Unknown proposal." };
  }
  if (proposal.origin !== "manual-request") {
    return {
      ok: false,
      code: "not-rebuildable",
      error:
        "Only analyze-a-symbol proposals can be rebuilt from research. Use the symbol page to refresh research for this record.",
    };
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
  const fetchResearch =
    opts.fetchResearch ??
    ((s: string) => fetchResearchContext(s, { dataDir, force: true }));
  const readSnapshot = opts.readSnapshot ?? defaultSnapshot;

  const [bars, quote, snapshot, research] = await Promise.all([
    fetchBars(proposal.symbol),
    fetchQuote(proposal.symbol),
    readSnapshot(proposal.account),
    fetchResearch(proposal.symbol),
  ]);

  if (!snapshot) {
    return {
      ok: false,
      code: "no-snapshot",
      error: `No ${proposal.account} snapshot to size against. Refresh the account first.`,
    };
  }

  const researchAt = now.toISOString();
  const derived = await deriveProposalFromResearch({
    symbol: proposal.symbol,
    bars,
    quote,
    equity: snapshot.equity,
    research,
    account: proposal.account,
    advisory: proposal.advisory,
    id: proposal.id,
    // Preserve the original creation time + lifecycle; re-derive everything else.
    createdAt: proposal.createdAt,
    pricedAt: researchAt,
    researchAt,
    status: proposal.status,
    origin: proposal.origin,
    redTeamExec: opts.redTeamExec,
  });
  if (!derived.ok) return derived;

  const written = await overwriteProposal(derived.proposal, { dataDir });
  if (!written) {
    return {
      ok: false,
      code: "not-found",
      error: "Could not persist the refreshed research.",
    };
  }
  return { ok: true, proposal: derived.proposal, researchAt };
}
