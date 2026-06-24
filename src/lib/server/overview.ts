import "server-only";

import {
  readJournal,
  readLatestRunByRoutine,
  readProposals,
  readRunLogs,
} from "./data";
import { getEvaluationScorecard } from "./eval";
import { RISK_LIMITS } from "@strategy/charter.config";
import {
  ROUTINE_CATALOG,
  type RoutineRun,
  type RunStatus,
} from "@/lib/routines";
import type { VerdictKind } from "@/lib/eval/scorecard";
import type {
  EquityPoint,
  JournalEntry,
  PortfolioSnapshot,
  TradeProposal,
} from "@/lib/types";

/**
 * Server-only assembler for the expanded Overview modules. Everything here is
 * read through the existing `data/` readers and the existing evaluation /
 * routines machinery — no new execution path, no new data source. The page
 * stays a thin renderer; the reads + the small pure derivations live here.
 *
 * The account-shaped figures (open-position headroom, current drawdown) are
 * derived from the SAME resolved paper snapshot the page already shows in its
 * KPI row, so the guardrail bars can never contradict the headline numbers.
 */

export interface AttentionCounts {
  /** Proposals awaiting a human approve/reject. */
  pendingReview: number;
  /** Orders blocked today by the rules engine or the red-team. */
  blockedToday: number;
  /** Routines whose latest run errored (process alerts). */
  stalledRoutines: number;
}

export interface GuardrailRail {
  /** Current value against the rail (e.g. open positions, orders today). */
  used: number;
  /** The charter limit. */
  limit: number;
  /** Fraction of the rail consumed, clamped to [0, 1]. */
  fraction: number;
}

export interface Guardrails {
  openPositions: GuardrailRail;
  ordersToday: GuardrailRail;
  /** Drawdown is special: `used`/`limit` are percentages (magnitudes). */
  drawdown: GuardrailRail & { breached: boolean };
}

export type ActivityKind = "trade" | "rejection";

export interface ActivityItem {
  id: string;
  timestamp: string;
  symbol: string;
  kind: ActivityKind;
  /** A compact one-line summary (e.g. "BUY 9 @ $432.75" or "Blocked — rules"). */
  detail: string;
  tone: "gain" | "loss" | "neutral";
}

export interface RoutinesHealth {
  routines: RoutineRun[];
  /** Dead-man switch: a recent successful-ish heartbeat across all routines. */
  healthy: boolean;
  /** Most recent finish across every routine, or null when nothing has run. */
  lastBeat: string | null;
  /** Routines whose latest run is holding a lock. */
  locked: number;
}

export interface EvalSnapshot {
  points: number;
  windowDays: number | null;
  startDate: string | null;
  endDate: string | null;
  excessReturnPct: number | null;
  benchmarkSymbol: string;
  integrityPasses: boolean;
  verdict: VerdictKind;
}

export interface OverviewModules {
  attention: AttentionCounts;
  awaitingReview: TradeProposal[];
  guardrails: Guardrails;
  activity: ActivityItem[];
  routinesHealth: RoutinesHealth;
  evaluation: EvalSnapshot;
}

/** How many pending proposals / activity rows the compact modules show. */
const AWAITING_LIMIT = 3;
const ACTIVITY_LIMIT = 6;

/** Calendar date (YYYY-MM-DD) of an ISO instant in US/Eastern. en-CA → ISO. */
function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Current drawdown magnitude from the equity curve's high-water mark (≥ 0). */
function currentDrawdown(curve: EquityPoint[]): number {
  if (curve.length === 0) return 0;
  let peak = curve[0].equity;
  for (const p of curve) if (p.equity > peak) peak = p.equity;
  const last = curve[curve.length - 1].equity;
  if (peak <= 0) return 0;
  return Math.max(0, 1 - last / peak);
}

function rail(used: number, limit: number): GuardrailRail {
  return {
    used,
    limit,
    fraction: limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0,
  };
}

function activityFromJournal(entry: JournalEntry): ActivityItem {
  if (entry.kind === "trade") {
    const verb = entry.action === "buy" ? "BUY" : "SELL";
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      symbol: entry.symbol,
      kind: "trade",
      detail: `${verb} ${entry.qty} @ ${entry.price.toFixed(2)}`,
      tone: entry.action === "buy" ? "gain" : "loss",
    };
  }
  const by =
    entry.rejectedBy === "codex-redteam"
      ? "red-team"
      : entry.rejectedBy === "rules"
        ? "rules"
        : "human";
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    symbol: entry.symbol,
    kind: "rejection",
    detail: `Blocked — ${by}`,
    tone: "loss",
  };
}

/**
 * Assemble the Overview modules. `paperSnapshot` is the resolved paper account
 * the page is already displaying (Alpaca-live or seed) so the guardrail
 * headroom matches the KPI row exactly.
 */
export async function getOverviewModules(
  paperSnapshot: PortfolioSnapshot | null,
): Promise<OverviewModules> {
  const [proposals, journal, runLogs, latestByRoutine, scorecard] =
    await Promise.all([
      readProposals(),
      readJournal(),
      readRunLogs(), // newest first
      readLatestRunByRoutine(),
      getEvaluationScorecard(),
    ]);

  const todayET = easternDate(new Date().toISOString());

  // — Attention —
  const pending = proposals.filter((p) => p.status === "pending");
  const blockedToday = journal.filter(
    (e) =>
      e.kind === "rejection" &&
      (e.rejectedBy === "rules" || e.rejectedBy === "codex-redteam") &&
      easternDate(e.timestamp) === todayET,
  ).length;

  const routines: RoutineRun[] = ROUTINE_CATALOG.map((r) => {
    const log = latestByRoutine[r.id];
    return {
      ...r,
      lastRun: log?.startedAt ?? null,
      lastStatus: (log?.status as RunStatus) ?? "never",
    };
  });
  const stalledRoutines = routines.filter(
    (r) => r.lastStatus === "error",
  ).length;

  // — Guardrails — derived from the same snapshot the KPI row shows.
  const openPositions = paperSnapshot?.positions.length ?? 0;
  const ordersToday = runLogs
    .filter((l) => easternDate(l.startedAt) === todayET)
    .reduce((sum, l) => sum + l.ordersPlaced, 0);
  const dd = currentDrawdown(paperSnapshot?.equityCurve ?? []);
  const guardrails: Guardrails = {
    openPositions: rail(openPositions, RISK_LIMITS.maxConcurrentPositions),
    ordersToday: rail(ordersToday, RISK_LIMITS.maxOrdersPerDay),
    drawdown: {
      ...rail(dd, RISK_LIMITS.drawdownHaltPct),
      breached: dd >= RISK_LIMITS.drawdownHaltPct,
    },
  };

  // — Activity — newest first (readJournal already sorts desc).
  const activity = journal.slice(0, ACTIVITY_LIMIT).map(activityFromJournal);

  // — Routines & health — mirrors the Routines page dead-man switch.
  const lastBeat = runLogs[0]?.finishedAt ?? null;
  const healthy = lastBeat !== null && runLogs[0].status !== "error";
  const locked = routines.filter((r) => r.lastStatus === "locked").length;

  // — Evaluation gate snapshot —
  const { window, benchmark, integrity, verdict } = scorecard;
  const evaluation: EvalSnapshot = {
    points: window.points,
    windowDays:
      window.startDate && window.endDate
        ? daysBetween(window.startDate, window.endDate)
        : null,
    startDate: window.startDate,
    endDate: window.endDate,
    excessReturnPct: benchmark.excessReturnPct,
    benchmarkSymbol: benchmark.symbol,
    integrityPasses: integrity.passes,
    verdict: verdict.kind,
  };

  return {
    attention: {
      pendingReview: pending.length,
      blockedToday,
      stalledRoutines,
    },
    awaitingReview: pending.slice(0, AWAITING_LIMIT),
    guardrails,
    activity,
    routinesHealth: { routines, healthy, lastBeat, locked },
    evaluation,
  };
}
