/**
 * Static routine metadata for the M3 shell. In Phase 2 these become real
 * launchd/cron jobs whose status is read from run logs; for now the schedule is
 * canonical (from architecture.md) and the run status is stubbed sample data.
 */

export type RunStatus = "ok" | "error" | "skipped" | "never";

export type Routine = {
  id: string;
  name: string;
  description: string;
  schedule: string;
  lastRun: string | null;
  lastStatus: RunStatus;
};

export const ROUTINES: Routine[] = [
  {
    id: "pre-market-research",
    name: "Pre-market research",
    description: "Scan watchlist, news, and regime → candidate ideas.",
    schedule: "Mon–Fri · 8:00 AM ET",
    lastRun: "2026-06-23T08:00:00-04:00",
    lastStatus: "ok",
  },
  {
    id: "market-open-execution",
    name: "Market-open execution",
    description: "Apply rules, size positions, place (paper) orders with stops.",
    schedule: "Mon–Fri · 9:35 AM ET",
    lastRun: "2026-06-23T09:35:00-04:00",
    lastStatus: "ok",
  },
  {
    id: "midday-scan",
    name: "Midday scan",
    description: "Manage open positions, stops, and risk.",
    schedule: "Mon–Fri · 12:30 PM ET",
    lastRun: "2026-06-23T12:30:00-04:00",
    lastStatus: "skipped",
  },
  {
    id: "end-of-day-summary",
    name: "End-of-day summary",
    description: "P&L, journal entries, and the daily snapshot.",
    schedule: "Mon–Fri · 4:15 PM ET",
    lastRun: "2026-06-22T16:15:00-04:00",
    lastStatus: "ok",
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    description: "Coaching pass; promote durable lessons into the playbook.",
    schedule: "Sun · 7:00 PM ET",
    lastRun: "2026-06-21T19:00:00-04:00",
    lastStatus: "ok",
  },
];

export const HEARTBEAT = {
  healthy: true,
  lastBeat: "2026-06-23T12:30:00-04:00",
};
