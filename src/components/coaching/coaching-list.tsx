"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CoachingDetailModal,
  gradeTone,
} from "@/components/coaching/coaching-detail-modal";
import { ChevronRightIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { groupByDay } from "@/lib/group";
import type { CoachingEntry } from "@/lib/types";

/**
 * The coaching log as a slim, date-grouped table + click-to-detail — the same
 * pattern as `JournalList` / `ProposalsList`, not a card wall. Entries bucket
 * into Eastern-day groups (`groupByDay`, unchanged) under serif day headers with
 * a count; each entry is a real <button> row that opens the formatted detail
 * modal. Presentation only — no data, grouping, or filtering changes.
 */
export function CoachingList({ entries }: { entries: CoachingEntry[] }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;
  const groups = groupByDay(entries, (e) => e.date);

  return (
    <>
      <div className="flex flex-col gap-7">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 className="font-serif text-sm font-semibold text-fg">
                {formatDate(group.key)}
              </h3>
              <span className="text-xs tabular-nums text-fg-muted">
                {group.items.length}
                {group.items.length === 1 ? " entry" : " entries"}
              </span>
            </div>
            <div className="divide-y divide-line/70 overflow-hidden rounded-card border border-line bg-surface">
              {group.items.map((e) => (
                <CoachingRow
                  key={e.id}
                  entry={e}
                  onOpen={() => setDetailId(e.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <CoachingDetailModal
        entry={detailEntry}
        open={detailEntry !== null}
        onDismiss={() => setDetailId(null)}
      />
    </>
  );
}

/**
 * A slim, scannable coaching row — a real <button> that opens the full-context
 * modal. A primary line (grade badge · serif subject · period tag · chevron)
 * over a muted meta line (related-journal count · promoted badge), so the log
 * stays dense yet readable at any width.
 */
function CoachingRow({
  entry: e,
  onOpen,
}: {
  entry: CoachingEntry;
  onOpen: () => void;
}) {
  const subject = e.symbol ?? "Desk";
  const tone = gradeTone[e.grade];
  const tileTint =
    tone === "gain"
      ? "bg-gain/12 text-gain"
      : tone === "loss"
        ? "bg-loss/12 text-loss"
        : "bg-fg-muted/10 text-fg-muted";
  const relatedCount = e.relatedJournalIds.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Grade ${e.grade} ${subject} ${e.period} review — open full context`}
      className="group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      {/* Primary line */}
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid size-7 shrink-0 place-items-center rounded-input font-serif text-sm font-semibold ${tileTint}`}
        >
          {e.grade}
        </span>
        <Badge tone={tone} solid>
          Grade {e.grade}
        </Badge>
        <span className="font-serif text-base font-semibold text-fg">
          {subject}
        </span>
        <span className="hidden items-center rounded-pill border border-line bg-surface px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg-muted sm:inline-flex">
          {e.period}
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          <ChevronRightIcon
            className="size-4 text-fg-muted transition-colors group-hover:text-fg"
            aria-hidden
          />
        </div>
      </div>

      {/* Meta line — related-journal count · promoted */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-fg-muted">
        <span className="tabular-nums">
          {relatedCount === 0
            ? "No linked decisions"
            : `${relatedCount} linked ${relatedCount === 1 ? "decision" : "decisions"}`}
        </span>
        {e.promotedToPlaybook ? (
          <>
            <Dot />
            <span className="rounded-pill border border-accent px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg">
              Promoted
            </span>
          </>
        ) : null}
      </div>
    </button>
  );
}

/** A faint separator dot between meta items. */
function Dot() {
  return (
    <span aria-hidden className="text-fg-muted/40">
      ·
    </span>
  );
}
