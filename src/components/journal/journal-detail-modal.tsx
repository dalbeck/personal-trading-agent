"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { TrendingDownIcon, TrendingUpIcon, XIcon } from "@/components/icons";
import { formatCurrency, formatDate, formatDateTime, formatQty } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";

const rejectedByLabel: Record<string, string> = {
  "codex-redteam": "Codex red-team",
  rules: "Charter rules",
  human: "Human",
};

/**
 * Full journal-entry context in a formatted, sectioned modal — the click-to-open
 * target that keeps the row slim. Sections: an entry header (ticker, kind/side,
 * timestamp, manual tag), the full markdown body (the LLM/desk narrative, always
 * rendered through the shared Markdown component), the protective stop/target
 * prices (trades), tags, the review date, and who rejected (rejections). Never a
 * raw text dump — every block is titled and formatted.
 */
export function JournalDetailModal({
  entry,
  open,
  onDismiss,
}: {
  entry: JournalEntry | null;
  open: boolean;
  onDismiss: () => void;
}) {
  const e = entry;
  if (!e) {
    return <Modal open={open} title="Journal entry" onDismiss={onDismiss} />;
  }

  const isTrade = e.kind === "trade";
  const buy = isTrade && e.action === "buy";
  const Icon = !isTrade ? XIcon : buy ? TrendingUpIcon : TrendingDownIcon;
  const iconTint = !isTrade
    ? "bg-loss/12 text-loss"
    : buy
      ? "bg-gain/12 text-gain"
      : "bg-loss/12 text-loss";

  const title = isTrade
    ? `${e.action.toUpperCase()} ${e.symbol} — full context`
    : `Rejected ${e.symbol} — full context`;

  const hasLevels =
    isTrade && (e.stopPrice !== null || e.takeProfit !== null);

  return (
    <Modal open={open} title={title} onDismiss={onDismiss}>
      <div className="flex flex-col gap-6">
        {/* Entry header — icon + side/kind pill + serif ticker + manual tag */}
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
          <span
            aria-hidden
            className={`grid size-10 shrink-0 place-items-center rounded-input ${iconTint}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg font-semibold text-fg">
                {e.symbol}
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
              {isTrade && e.manual ? <Badge tone="muted">live</Badge> : null}
            </div>
            <time
              className="mt-0.5 block text-xs tabular-nums text-fg-muted"
              dateTime={e.timestamp}
            >
              {formatDateTime(e.timestamp)}
            </time>
          </div>
          {isTrade ? (
            <span className="ml-auto text-right text-sm tabular-nums text-fg">
              {formatQty(e.qty)} @ {formatCurrency(e.price)}
            </span>
          ) : (
            <span className="ml-auto text-right text-sm tabular-nums text-fg-muted">
              proposed {e.proposedAction.toUpperCase()}
            </span>
          )}
        </div>

        {/* Narrative — the markdown body, always via the shared renderer */}
        <DetailSection title="Reasoning">
          <Markdown source={e.body} className="text-sm text-fg" />
        </DetailSection>

        {/* Protective levels — trades only, when defined */}
        {hasLevels ? (
          <DetailSection title="Protective levels">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {e.stopPrice !== null ? (
                <LevelRow label="Stop" value={formatCurrency(e.stopPrice)} />
              ) : null}
              {e.takeProfit !== null ? (
                <LevelRow
                  label="Target"
                  value={formatCurrency(e.takeProfit)}
                />
              ) : null}
            </dl>
          </DetailSection>
        ) : null}

        {/* Rejection rationale — who/what rejected it */}
        {!isTrade ? (
          <DetailSection title="Rejected by">
            <p className="text-sm text-fg">
              {rejectedByLabel[e.rejectedBy] ?? e.rejectedBy}
            </p>
          </DetailSection>
        ) : null}

        {/* Tags + review date */}
        {(e.tags.length > 0 || e.reviewDate) ? (
          <DetailSection title="Filing">
            {e.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill bg-surface-overlay px-2.5 py-0.5 text-xs text-fg-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="text-xs tabular-nums text-fg-muted">
              Review {formatDate(e.reviewDate)}
            </p>
          </DetailSection>
        ) : null}
      </div>
    </Modal>
  );
}

/** A titled block inside the detail modal — a serif sub-heading + body. */
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-serif text-base font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

/** One labelled figure in the protective-levels grid. */
function LevelRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-fg">{value}</dd>
    </>
  );
}
