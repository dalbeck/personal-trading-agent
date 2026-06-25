import { z } from "zod";

/**
 * Runtime contracts for everything the engine writes into `data/` and the
 * dashboard reads back. Zod schemas are the single source of truth; the
 * TypeScript types in `./types.ts` are inferred from these, so the validated
 * shape and the compile-time shape can never drift.
 *
 * All money values are plain numbers in the account currency (USD). Ratios
 * (e.g. `totalPlPct`) are fractions, not percentages: 0.0482 === +4.82%.
 */

const money = z.number().finite();
const ratio = z.number().finite();
const symbol = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Z0-9.\-]+$/, "ticker must be uppercase letters/digits");
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

export const AccountKind = z.enum(["paper", "live"]);

/* --------------------------------------------------------------------------
 * Position — a single open holding within a snapshot.
 * ------------------------------------------------------------------------ */
export const PositionSchema = z
  .object({
    symbol,
    side: z.enum(["long", "short"]).default("long"),
    qty: z.number().positive(),
    avgCost: money,
    lastPrice: money,
    marketValue: money,
    costBasis: money,
    unrealizedPl: money,
    unrealizedPlPct: ratio,
    stopPrice: money.nullable().default(null),
    openedAt: isoDate,
  })
  .strict();

/* --------------------------------------------------------------------------
 * PortfolioSnapshot — point-in-time account state captured by the engine.
 * ------------------------------------------------------------------------ */
export const EquityPointSchema = z
  .object({ date: isoDate, equity: money })
  .strict();

export const BenchmarkSchema = z
  .object({
    symbol, // e.g. "SPY"
    portfolioReturnPct: ratio,
    benchmarkReturnPct: ratio,
  })
  .strict();

export const PortfolioSnapshotSchema = z
  .object({
    account: AccountKind,
    asOf: isoDateTime,
    currency: z.string().length(3).default("USD"),
    equity: money,
    cash: money,
    buyingPower: money,
    totalPl: money,
    totalPlPct: ratio,
    dayPl: money,
    dayPlPct: ratio,
    positions: z.array(PositionSchema),
    benchmark: BenchmarkSchema.optional(),
    equityCurve: z.array(EquityPointSchema).default([]),
  })
  .strict();

/* --------------------------------------------------------------------------
 * JournalEntry — one entry per trade AND per rejection, written at decision
 * time. Discriminated on `kind`.
 * ------------------------------------------------------------------------ */
const JournalBase = {
  id: z.string().min(1),
  timestamp: isoDateTime,
  symbol,
  // Which book the entry belongs to. Paper desk decisions default to `paper`;
  // a `live` entry is a trade the human placed manually in Robinhood, ingested
  // read-only for coaching (see `manual` on the trade entry). Older entries
  // without the field read as `paper`.
  account: AccountKind.default("paper"),
  reviewDate: isoDate,
  tags: z.array(z.string()).default([]),
  // The narrative (thesis + reasoning) is the markdown body of the `.md` file;
  // the fields above are its YAML frontmatter. See `.agents/data-format.md`.
  body: z.string().min(1),
};

export const TradeJournalEntrySchema = z
  .object({
    ...JournalBase,
    kind: z.literal("trade"),
    action: z.enum(["buy", "sell"]),
    side: z.enum(["long", "short"]).default("long"),
    qty: z.number().positive(),
    price: money,
    stopPrice: money.nullable().default(null),
    takeProfit: money.nullable().default(null),
    riskPct: ratio.nullable().default(null),
    // True when the human executed this trade by hand (live account) rather than
    // the paper desk placing it. Manual live trades are ingested read-only from
    // Robinhood order history for coaching — never executed by this app.
    manual: z.boolean().default(false),
  })
  .strict();

export const RejectionJournalEntrySchema = z
  .object({
    ...JournalBase,
    kind: z.literal("rejection"),
    proposedAction: z.enum(["buy", "sell"]),
    rejectedBy: z.enum(["codex-redteam", "rules", "human"]),
  })
  .strict();

export const JournalEntrySchema = z.discriminatedUnion("kind", [
  TradeJournalEntrySchema,
  RejectionJournalEntrySchema,
]);

/* --------------------------------------------------------------------------
 * TradeProposal — a pending agent idea surfaced in the Proposals view.
 * ------------------------------------------------------------------------ */
/**
 * One keyed factor in the red-team's structured rationale — the prosecutor's
 * short take on a single dimension (entry, target, stop, edge, reward/risk, …).
 * `stance` colours the row: `refutes` is an objection, `supports` held up,
 * `neutral` is mixed. See `.agents/data-format.md`.
 */
export const RedTeamFactorSchema = z
  .object({
    label: z.string().min(1),
    assessment: z.string().min(1),
    stance: z.enum(["supports", "refutes", "neutral"]).default("neutral"),
  })
  .strict();

export const RedTeamVerdictSchema = z
  .object({
    verdict: z.enum(["approve", "reject", "concern"]),
    // The prosecutor's primary objection (or, when approving, why the thesis
    // survived). Required + kept for back-compatibility with pre-structured
    // verdicts that carried only `verdict` + `notes`.
    notes: z.string().min(1),
    // Keyed factor assessments (entry/target/stop/edge/…). Defaults to `[]` so
    // older records still validate and the UI falls back to `notes`.
    factors: z.array(RedTeamFactorSchema).default([]),
    // One-line "how it decided" / conviction summary. Null for older records.
    basis: z.string().nullable().default(null),
  })
  .strict();

export const TradeProposalSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoDateTime,
    symbol,
    action: z.enum(["buy", "sell"]),
    side: z.enum(["long", "short"]).default("long"),
    qty: z.number().positive(),
    limitPrice: money, // marketable-limit only (charter)
    stopPrice: money.nullable().default(null),
    takeProfit: money.nullable().default(null),
    riskPct: ratio,
    confidence: z.number().min(0).max(1).nullable().default(null),
    thesis: z.string().min(1),
    reasoning: z.string().min(1),
    // `reviewed` / `dismissed` are the terminal states for **advisory** (live)
    // proposals — the human acted on (or set aside) guidance they execute
    // manually. They are NEVER produced by the order/approval path, which only
    // ever writes `approved` / `rejected`. See `.agents/data-format.md`.
    status: z
      .enum(["pending", "approved", "rejected", "reviewed", "dismissed"])
      .default("pending"),
    // Which account the proposal is for. `live` proposals are advisory-only in
    // this phase (the harness order gate is closed) and must never route to any
    // execution path. Live records written for the paper desk omit this.
    account: z.enum(["paper", "live"]).default("paper"),
    // Advisory-only marker: guidance for the human to execute manually in
    // Robinhood — there is no approve-to-execute action and no order path can be
    // reached from it. Tagged `live · advisory · execute manually` in the UI.
    advisory: z.boolean().default(false),
    redTeam: RedTeamVerdictSchema.nullable().default(null),
    reviewByDate: isoDate.nullable().default(null),
    // Seeded/demo content. Live records written by the routines/scout omit this
    // (or set it false). Any view rendering a sample record flags it so demo
    // data is never shown as if it were live. See `.agents/data-format.md`.
    sample: z.boolean().default(false),
  })
  .strict();

/* --------------------------------------------------------------------------
 * MaterialNews — a headline the news scout judged material to a held name
 * (data/news/<date>.json holds an array of these).
 * ------------------------------------------------------------------------ */
export const MaterialNewsItemSchema = z
  .object({
    symbol, // the held ticker this is material to
    title: z.string().min(1),
    link: z.url(),
    source: z.string().min(1),
    publishedAt: z.string().nullable().default(null), // raw RFC-822 from RSS
    reason: z.string().min(1),
    seenAt: isoDateTime, // when the scout caught it
    // Seeded/demo content (see `TradeProposalSchema.sample`). Live scout output
    // omits this; the News view flags any file containing sample items.
    sample: z.boolean().default(false),
  })
  .strict();

export const NewsFileSchema = z.array(MaterialNewsItemSchema);

/* --------------------------------------------------------------------------
 * CoachingEntry — self-graded review vs. actual prices (coaching-log).
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * RunLog — one structured record per routine run (data/logs/). Drives the
 * Routines + Logs dashboard views and the dead-man switch.
 * ------------------------------------------------------------------------ */
export const ROUTINE_IDS = [
  "pre-market-research",
  "market-open-execution",
  "midday-scan",
  "end-of-day-summary",
  "weekly-review",
] as const;

export const RunLogSchema = z
  .object({
    routine: z.enum(ROUTINE_IDS),
    startedAt: isoDateTime,
    finishedAt: isoDateTime,
    status: z.enum(["ok", "error", "skipped", "locked"]),
    summary: z.string().min(1),
    proposalsConsidered: z.number().int().nonnegative().default(0),
    ordersPlaced: z.number().int().nonnegative().default(0),
    rejections: z.number().int().nonnegative().default(0),
  })
  .strict();

/* --------------------------------------------------------------------------
 * ResearchUsage — per-day metered-API call counter (data/research/) that
 * enforces the Perplexity daily cap in code (Phase 2 M8).
 * ------------------------------------------------------------------------ */
export const ResearchUsageSchema = z
  .object({
    date: isoDate,
    count: z.number().int().nonnegative(),
    // Cumulative real per-call cost (USD) the Agent API reported, when
    // available. The count remains the hard daily guardrail; cost is visibility
    // only. Optional for backward compatibility with pre-cost usage files.
    costUsd: z.number().nonnegative().optional(),
  })
  .strict();

export const CoachingEntrySchema = z
  .object({
    id: z.string().min(1),
    date: isoDate,
    period: z.enum(["daily", "weekly"]),
    // Which book this self-review covers. `paper` = the autonomous desk's own
    // decisions (the default and the bulk of coaching); `live` = a review of
    // the human's manually-placed live trades. Coaching stays behavior-driven
    // either way — it reviews decisions, not mere ownership.
    account: AccountKind.default("paper"),
    symbol: symbol.nullable().default(null),
    relatedJournalIds: z.array(z.string()).default([]),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    promotedToPlaybook: z.boolean().default(false),
    // The self-review prose (expected / actual / lesson) is the markdown body
    // of the `.md` file; the fields above are its frontmatter.
    body: z.string().min(1),
  })
  .strict();

/* --------------------------------------------------------------------------
 * Watchlist — the editable half of the tracked universe (data/control/
 * watchlist.json). The other half is the active book's holdings. Together they
 * feed the news scout and the research routine, and drive symbol auto-surfacing
 * (see `src/lib/server/universe.ts`). A single small JSON state file, like the
 * funding tracker / live-halt latch.
 *
 * Each entry carries its **provenance**: `manual` (the human typed it) or
 * `discovery` (the autonomous discovery run auto-tracked it). Discovery adds are
 * bounded by `DISCOVERY_LIMITS.maxWatchlistSymbols`; the human can prune either.
 * ------------------------------------------------------------------------ */
export const WatchlistSource = z.enum(["manual", "discovery"]);

export const WatchlistEntrySchema = z
  .object({
    symbol,
    source: WatchlistSource.default("manual"),
    addedAt: isoDateTime.nullable().default(null),
  })
  .strict();

export const WatchlistSchema = z
  .object({
    entries: z.array(WatchlistEntrySchema).default([]),
    updatedAt: isoDateTime.nullable().default(null),
  })
  .strict();
