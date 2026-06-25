import type { ROUTINE_IDS } from "@/lib/schemas";

/**
 * Static catalog of the five scheduled routines (id, name, description,
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
    description: "Manage open positions, stops, and risk.",
    schedule: "Mon–Fri · 12:30 PM ET",
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
];
