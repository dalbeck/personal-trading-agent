import type { z } from "zod";
import type {
  AccountKind,
  BenchmarkSchema,
  CoachingEntrySchema,
  EquityPointSchema,
  JournalEntrySchema,
  MaterialNewsItemSchema,
  PortfolioSnapshotSchema,
  PositionSchema,
  RedTeamVerdictSchema,
  RejectionJournalEntrySchema,
  RunLogSchema,
  TradeJournalEntrySchema,
  TradeProposalSchema,
  WatchlistSchema,
} from "./schemas";

/**
 * Compile-time types inferred from the zod schemas. Import these in components
 * and readers; never hand-maintain a parallel interface (it would drift from
 * the runtime contract).
 */
export type Account = z.infer<typeof AccountKind>;
export type Position = z.infer<typeof PositionSchema>;
export type EquityPoint = z.infer<typeof EquityPointSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

export type TradeJournalEntry = z.infer<typeof TradeJournalEntrySchema>;
export type RejectionJournalEntry = z.infer<typeof RejectionJournalEntrySchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export type RedTeamVerdict = z.infer<typeof RedTeamVerdictSchema>;
export type TradeProposal = z.infer<typeof TradeProposalSchema>;

export type CoachingEntry = z.infer<typeof CoachingEntrySchema>;

export type RunLog = z.infer<typeof RunLogSchema>;

export type MaterialNewsItem = z.infer<typeof MaterialNewsItemSchema>;

export type Watchlist = z.infer<typeof WatchlistSchema>;
