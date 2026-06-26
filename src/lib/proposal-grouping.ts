import type { TradeProposal } from "@/lib/types";

/**
 * Group proposals into date sections for the slim Proposals table (M8). Buckets
 * by the proposal's `createdAt` **Eastern-time calendar day** (the desk's clock,
 * matching `formatDateTime`), newest day first, newest proposal first within a
 * day. Each group carries a human label — "Today" / "Yesterday" relative to
 * `nowMs`, otherwise the formatted date — so the table reads as a dated feed.
 *
 * Pure and `nowMs`-injected so the "Today"/"Yesterday" boundary is testable.
 */
export interface ProposalDayGroup {
  /** Stable ET day key, `YYYY-MM-DD` — React list key and sort handle. */
  key: string;
  /** Header label, e.g. "Today · Jun 26", "Yesterday · Jun 25", "Jun 22". */
  label: string;
  items: TradeProposal[];
}

/** ISO datetime → its Eastern-time calendar day as `YYYY-MM-DD`. */
function etDayKey(ms: number): string {
  // en-CA renders ISO-ordered Y-M-D, so the string sorts chronologically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** ET day key → "Jun 26" (no year for the current ET year, else "Jun 22, 2024"). */
function dayLabel(key: string, nowMs: number): string {
  const sameYear = key.slice(0, 4) === etDayKey(nowMs).slice(0, 4);
  const d = new Date(`${key}T12:00:00Z`); // noon UTC: safe inside any ET day
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

export function groupProposalsByDay(
  proposals: TradeProposal[],
  nowMs: number,
): ProposalDayGroup[] {
  const todayKey = etDayKey(nowMs);
  const yesterdayKey = etDayKey(nowMs - 24 * 60 * 60 * 1000);

  const byDay = new Map<string, TradeProposal[]>();
  for (const p of proposals) {
    const key = etDayKey(Date.parse(p.createdAt));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(p);
    else byDay.set(key, [p]);
  }

  return [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest day first
    .map((key) => {
      const items = [...(byDay.get(key) ?? [])].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
      );
      const date = dayLabel(key, nowMs);
      const label =
        key === todayKey
          ? `Today · ${date}`
          : key === yesterdayKey
            ? `Yesterday · ${date}`
            : date;
      return { key, label, items };
    });
}
