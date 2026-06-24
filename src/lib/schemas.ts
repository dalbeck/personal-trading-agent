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
export const RedTeamVerdictSchema = z
  .object({
    verdict: z.enum(["approve", "reject", "concern"]),
    notes: z.string().min(1),
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
    status: z.enum(["pending", "approved", "rejected"]).default("pending"),
    redTeam: RedTeamVerdictSchema.nullable().default(null),
    reviewByDate: isoDate.nullable().default(null),
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

export const CoachingEntrySchema = z
  .object({
    id: z.string().min(1),
    date: isoDate,
    period: z.enum(["daily", "weekly"]),
    symbol: symbol.nullable().default(null),
    relatedJournalIds: z.array(z.string()).default([]),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    promotedToPlaybook: z.boolean().default(false),
    // The self-review prose (expected / actual / lesson) is the markdown body
    // of the `.md` file; the fields above are its frontmatter.
    body: z.string().min(1),
  })
  .strict();
