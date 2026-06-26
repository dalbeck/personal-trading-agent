"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Markdown } from "@/components/markdown";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { CoachingEntry } from "@/lib/types";

/** Grade → badge tone (A/B = gain, C = muted, D/F = loss). Shared with the row. */
export const gradeTone: Record<CoachingEntry["grade"], BadgeTone> = {
  A: "gain",
  B: "gain",
  C: "muted",
  D: "loss",
  F: "loss",
};

/**
 * Full coaching-entry context in a formatted, sectioned modal — the click-to-open
 * target that keeps the row slim (mirrors `JournalDetailModal`). Sections: an
 * entry header (grade + subject + period + account), the full markdown self-review
 * body (always rendered through the shared Markdown component), the related
 * journal IDs, and the playbook-promotion status. Never a raw text dump — every
 * block is titled and formatted. Presentation only.
 */
export function CoachingDetailModal({
  entry,
  open,
  onDismiss,
}: {
  entry: CoachingEntry | null;
  open: boolean;
  onDismiss: () => void;
}) {
  const e = entry;
  if (!e) {
    return <Modal open={open} title="Coaching entry" onDismiss={onDismiss} />;
  }

  const subject = e.symbol ?? "Desk";
  const title = `Grade ${e.grade} · ${subject} — self-review`;

  return (
    <Modal open={open} title={title} onDismiss={onDismiss}>
      <div className="flex flex-col gap-6">
        {/* Entry header — grade tile + subject + period/account + date */}
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
          <span
            aria-hidden
            className={`grid size-12 shrink-0 place-items-center rounded-input font-serif text-xl font-semibold ${
              gradeTone[e.grade] === "gain"
                ? "bg-gain/12 text-gain"
                : gradeTone[e.grade] === "loss"
                  ? "bg-loss/12 text-loss"
                  : "bg-fg-muted/10 text-fg-muted"
            }`}
          >
            {e.grade}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg font-semibold text-fg">
                {subject}
              </span>
              <Badge tone={gradeTone[e.grade]} solid>
                Grade {e.grade}
              </Badge>
              <Badge tone="muted">{e.period}</Badge>
              {e.promotedToPlaybook ? (
                <Badge tone="accent">Promoted to playbook</Badge>
              ) : null}
            </div>
            <time
              className="mt-0.5 block text-xs tabular-nums text-fg-muted"
              dateTime={e.date}
            >
              {formatDate(e.date)} · {e.account} book
            </time>
          </div>
        </div>

        {/* Narrative — the self-review markdown body, via the shared renderer */}
        <DetailSection title="Self-review">
          <Markdown source={e.body} className="text-sm text-fg" />
        </DetailSection>

        {/* Related decisions — the journal entries this review graded */}
        {e.relatedJournalIds.length > 0 ? (
          <DetailSection title="Related journal entries">
            <div className="flex flex-wrap gap-1.5">
              {e.relatedJournalIds.map((id) => (
                <span
                  key={id}
                  className="rounded-pill bg-surface-overlay px-2.5 py-0.5 text-xs tabular-nums text-fg-muted"
                >
                  {id}
                </span>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {/* Playbook promotion — whether this lesson graduated to the playbook */}
        <DetailSection title="Playbook">
          <p className="text-sm text-fg">
            {e.promotedToPlaybook
              ? "This lesson was promoted to the playbook."
              : "Not promoted to the playbook."}
          </p>
        </DetailSection>
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
