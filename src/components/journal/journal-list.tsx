"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { JournalDetailModal } from "@/components/journal/journal-detail-modal";
import {
  ChevronRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "@/components/icons";
import { formatCurrency, formatDate, formatDateTime, formatQty } from "@/lib/format";
import { groupByDay } from "@/lib/group";
import type { JournalEntry } from "@/lib/types";

const rejectedByLabel: Record<string, string> = {
  "codex-redteam": "Codex red-team",
  rules: "Charter rules",
  human: "Human",
};

/**
 * The Decision Journal feed as a slim, date-grouped table + click-to-detail —
 * the same pattern as `ProposalsList`, not a card wall. Entries bucket into the
 * page's existing day groups (`groupByDay`, unchanged) under serif day headers
 * with a count; each entry is a real <button> row that opens the formatted
 * detail modal. Presentation only — no data, grouping, or filtering changes.
 */
export function JournalList({ entries }: { entries: JournalEntry[] }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;
  const groups = groupByDay(entries, (e) => e.timestamp);

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
                <JournalRow
                  key={e.id}
                  entry={e}
                  onOpen={() => setDetailId(e.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <JournalDetailModal
        entry={detailEntry}
        open={detailEntry !== null}
        onDismiss={() => setDetailId(null)}
      />
    </>
  );
}

/**
 * A slim, scannable journal row — a real <button> that opens the full-context
 * modal. A primary line (kind/side pill · serif ticker · live tag · timestamp ·
 * chevron) over a muted meta line (qty·price for trades / "rejected by …" for
 * rejections, plus tags), so the audit trail stays dense yet readable.
 */
function JournalRow({
  entry: e,
  onOpen,
}: {
  entry: JournalEntry;
  onOpen: () => void;
}) {
  const isTrade = e.kind === "trade";
  const buy = isTrade && e.action === "buy";
  const Icon = !isTrade ? XIcon : buy ? TrendingUpIcon : TrendingDownIcon;
  const iconTint = !isTrade
    ? "bg-loss/12 text-loss"
    : buy
      ? "bg-gain/12 text-gain"
      : "bg-loss/12 text-loss";

  const ariaLabel = isTrade
    ? `${e.action.toUpperCase()} ${e.symbol} — open full context`
    : `Rejected ${e.symbol} — open full context`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      {/* Primary line */}
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid size-7 shrink-0 place-items-center rounded-input ${iconTint}`}
        >
          <Icon className="size-4" />
        </span>
        {isTrade ? (
          <Badge tone={buy ? "gain" : "loss"} solid>
            {e.action.toUpperCase()}
          </Badge>
        ) : (
          <Badge tone="loss" solid>
            REJECTED
          </Badge>
        )}
        <span className="font-serif text-base font-semibold text-fg">
          {e.symbol}
        </span>
        {isTrade && e.manual ? (
          <span className="hidden items-center rounded-pill border border-accent bg-surface px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg sm:inline-flex">
            live
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2.5">
          <time
            className="text-xs tabular-nums text-fg-muted"
            dateTime={e.timestamp}
          >
            {formatDateTime(e.timestamp)}
          </time>
          <ChevronRightIcon
            className="size-4 text-fg-muted transition-colors group-hover:text-fg"
            aria-hidden
          />
        </div>
      </div>

      {/* Meta line — qty·price for trades / rejected-by for rejections · tags */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-xs text-fg-muted">
        {isTrade ? (
          <span className="tabular-nums">
            {formatQty(e.qty)} @ {formatCurrency(e.price)}
          </span>
        ) : (
          <span>
            rejected by{" "}
            <span className="text-fg">
              {rejectedByLabel[e.rejectedBy] ?? e.rejectedBy}
            </span>
          </span>
        )}
        {e.tags.length > 0 ? <Dot /> : null}
        {e.tags.slice(0, 3).map((t) => (
          <span key={t} className="truncate">
            {t}
          </span>
        ))}
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
