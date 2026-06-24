/**
 * Stubbed recent run-log lines for the M3 shell. Phase 2 replaces this with
 * real transcripts read from the routines' run output.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogLine = {
  timestamp: string;
  routine: string;
  level: LogLevel;
  message: string;
};

export const RECENT_LOGS: LogLine[] = [
  {
    timestamp: "2026-06-23T12:30:04-04:00",
    routine: "midday-scan",
    level: "warn",
    message: "Skipped: market data feed returned stale quotes; no actions taken.",
  },
  {
    timestamp: "2026-06-23T09:35:12-04:00",
    routine: "market-open-execution",
    level: "info",
    message: "Placed 2 paper orders (MSFT, COST) within risk caps; 1 idea deferred.",
  },
  {
    timestamp: "2026-06-23T08:00:09-04:00",
    routine: "pre-market-research",
    level: "info",
    message: "Generated 4 candidate ideas; 1 rejected by volatility filter (SMCI).",
  },
  {
    timestamp: "2026-06-22T16:15:03-04:00",
    routine: "end-of-day-summary",
    level: "info",
    message: "Wrote snapshot 2026-06-22 and 2 journal entries; day P&L −$612.40.",
  },
  {
    timestamp: "2026-06-21T19:00:21-04:00",
    routine: "weekly-review",
    level: "info",
    message: "Coaching pass complete; promoted 1 lesson to the playbook.",
  },
];
