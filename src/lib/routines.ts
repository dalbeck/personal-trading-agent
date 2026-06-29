import type { ROUTINE_IDS } from "@/lib/schemas";

/**
 * Static catalog of the scheduled routines (id, name, description,
 * cadence). The launchd plists in `scripts/` fire them; their run **status** is
 * read at request time from `data/logs/` (see `readLatestRunByRoutine`), so the
 * dashboard reflects reality rather than a stub.
 */

export type RoutineId = (typeof ROUTINE_IDS)[number];
export type RunStatus = "ok" | "error" | "skipped" | "locked" | "never";

export interface RoutineInfo {
  id: RoutineId;
  name: string;
  description: string;
  schedule: string;
}

export interface RoutineRun extends RoutineInfo {
  lastRun: string | null;
  lastStatus: RunStatus;
}

/** Routines that place (paper) orders — a "Run now" of these is confirm-gated
 *  in the UI (AlertDialog) before it triggers. The rest are read/write-only
 *  (research, scans, summaries, coaching) and run without a confirm. */
export const ORDER_PLACING_ROUTINES: RoutineId[] = ["market-open-execution"];

export function routinePlacesOrders(id: RoutineId): boolean {
  return ORDER_PLACING_ROUTINES.includes(id);
}

export const ROUTINE_CATALOG: RoutineInfo[] = [
  {
    id: "live-snapshot-refresh",
    name: "Live snapshot refresh",
    description:
      "Read-only pull of the live Robinhood account → fresh live snapshot (no order path).",
    schedule: "Mon–Fri · 7:55 AM, 12:25 & 3:55 PM ET",
  },
  {
    id: "pre-market-research",
    name: "Pre-market research",
    description: "Scan watchlist, news, and regime → candidate proposals.",
    schedule: "Mon–Fri · 8:00 AM ET",
  },
  {
    id: "market-open-execution",
    name: "Market-open execution",
    description:
      "Gate each proposal through risk rails + red-team, then place (paper) orders with stops.",
    schedule: "Mon–Fri · 9:35 AM ET",
  },
  {
    id: "midday-scan",
    name: "Midday scan",
    description: "Manage open paper positions, stops, and risk.",
    schedule: "Mon–Fri · 12:30 PM ET",
  },
  {
    id: "live-position-management",
    name: "Live position management",
    description:
      "Review live Robinhood holdings vs thesis/stop/take-profit → live exit/trim proposals (human-approved).",
    schedule: "Mon–Fri · 12:35 PM ET",
  },
  {
    id: "end-of-day-summary",
    name: "End-of-day summary",
    description: "P&L, journal entries, and the daily snapshot.",
    schedule: "Mon–Fri · 4:15 PM ET",
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    description: "Coaching pass; promote durable lessons into the playbook.",
    schedule: "Sun · 7:00 PM ET",
  },
  {
    id: "portfolio-rebalance-review",
    name: "Portfolio rebalance review",
    description:
      "Compute per-sleeve drift vs the target allocation → rebalancing suggestions (trim/add, human-approved). A slower cadence than the daily desk — core/mid don't want a daily idea hunt.",
    schedule: "First Mon of month · 5:00 PM ET",
  },
];
