"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { ChevronRightIcon } from "@/components/icons";
import { confidenceBucket } from "@/lib/confidence";
import { CONVICTION_TIERS } from "@/lib/conviction";
import { convictionDisplay } from "@/lib/conviction-display";
import { horizonChip, sleeveStyle } from "@/lib/strategy-style";
import { sleeveOf } from "@/lib/sleeves";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { redTeamVerdictStyle } from "@/lib/red-team-style";
import { groupProposalsByDay } from "@/lib/proposal-grouping";
import {
  ADVISORY_TAG,
  LIVE_APPROVE_TAG,
  isAdvisoryProposal,
} from "@/lib/proposal-advisory";
import type { TradeProposal } from "@/lib/types";

type Status = TradeProposal["status"];

const statusTone: Record<Status, BadgeTone> = {
  pending: "accent",
  approved: "gain",
  rejected: "loss",
  reviewed: "gain",
  dismissed: "muted",
};

/**
 * The slim, scannable proposals **index** (M8). Each row links to the dedicated
 * detail page (`/proposals/[id]`) — the full-context modal was replaced by a
 * page, so the row click navigates rather than opening a dialog. The decision
 * flow (approve/reject + precheck) lives on the detail page now. This component
 * keeps only the conviction-tier filter + day grouping.
 */
export function ProposalsList({
  proposals,
  initialMinTier = "watch",
}: {
  proposals: TradeProposal[];
  /** The persisted "minimum conviction to surface" preference (M3) — the queue's
   *  default filter. `watch` = show all (the default). A view preference: the
   *  human can still change the filter for the session. */
  initialMinTier?: "high" | "moderate" | "watch";
}) {
  // Optional conviction filter (M1) — a **view** preference. Raising it removes
  // only proposals explicitly tiered below the threshold; untiered (unscored /
  // legacy / manual) proposals always stay visible — the filter never silently
  // drops something it didn't rank low. The persisted default lives in the
  // discovery settings (M3): watch → all, moderate → moderate+, high → high only.
  const [tierFilter, setTierFilter] = useState<"all" | "moderate" | "high">(
    initialMinTier === "high"
      ? "high"
      : initialMinTier === "moderate"
        ? "moderate"
        : "all",
  );
  const hasTiers = useMemo(
    () => proposals.some((p) => p.convictionTier !== null),
    [proposals],
  );
  const visible = useMemo(() => {
    if (tierFilter === "all") return proposals;
    const minRank = tierFilter === "high" ? 0 : 1; // high → 0, moderate → 1
    return proposals.filter((p) => {
      if (p.convictionTier === null) return true; // never hide the unscored
      return CONVICTION_TIERS.indexOf(p.convictionTier) <= minRank;
    });
  }, [proposals, tierFilter]);

  // The "Today"/"Yesterday" boundary is captured once per mount so date headers
  // stay stable through re-renders (router.refresh, status updates).
  const [nowMs] = useState(() => Date.now());
  // Group by ET day (newest day first) with the newest proposal at the top of
  // each day — `groupProposalsByDay` already orders items newest-first by
  // `createdAt`, so the day reads as a chronological feed.
  const groups = useMemo(() => groupProposalsByDay(visible, nowMs), [visible, nowMs]);

  return (
    <>
      {hasTiers ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-muted">
            Newest first · all tiers shown
          </span>
          <div
            className="ml-auto inline-flex overflow-hidden rounded-pill border border-line"
            role="group"
            aria-label="Filter by conviction tier"
          >
            {(
              [
                ["all", "All tiers"],
                ["moderate", "Moderate+"],
                ["high", "High only"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tierFilter === value}
                onClick={() => setTierFilter(value)}
                className={`px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  tierFilter === value
                    ? "bg-accent/15 text-fg"
                    : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-7">
        {groups.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
            No proposals at this conviction level. Lower the filter to “All
            tiers” to see every candidate.
          </p>
        ) : null}
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h3 className="font-serif text-sm font-semibold text-fg">
                {group.label}
              </h3>
              <span className="text-xs tabular-nums text-fg-muted">
                {group.items.length}
                {group.items.length === 1 ? " proposal" : " proposals"}
              </span>
            </div>
            <div className="divide-y divide-line/70 overflow-hidden rounded-card border border-line bg-surface">
              {group.items.map((p) => (
                <ProposalRow key={p.id} proposal={p} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/**
 * A slim, scannable proposal row — a link to the dedicated detail page. A
 * primary line (side pill · serif ticker · tags · status · chevron) over a muted
 * meta line (sector · R:R · red-team verdict · confidence), so the feed stays
 * dense yet readable at any width.
 */
function ProposalRow({ proposal: p }: { proposal: TradeProposal }) {
  const advisory = isAdvisoryProposal(p);
  const liveApprovable = p.account === "live" && !advisory;
  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  const conf = p.confidence === null ? null : confidenceBucket(p.confidence);
  const verdict = p.redTeam ? redTeamVerdictStyle[p.redTeam.verdict] : null;
  // Conviction is a ranking signal, not a verdict (conviction-honesty M1): it's
  // muted + flagged when the red-team rejects, so a rejected proposal never reads
  // as a confident "high".
  const conviction = convictionDisplay(p.convictionTier, p.redTeam?.verdict);

  return (
    <Link
      href={`/proposals/${p.id}`}
      aria-label={`${p.action.toUpperCase()} ${p.symbol} — open full context`}
      className="group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      {/* Primary line */}
      <div className="flex items-center gap-2.5">
        <Badge tone={p.action === "buy" ? "gain" : "loss"} solid>
          {p.action.toUpperCase()}
        </Badge>
        <span className="font-serif text-base font-semibold text-fg">
          {p.symbol}
        </span>
        {(() => {
          const sleeve = sleeveOf(p);
          const chip = horizonChip(sleeve);
          return (
            <>
              <Badge tone={sleeveStyle[sleeve].tone}>
                {sleeveStyle[sleeve].label}
              </Badge>
              <Badge tone={chip.tone}>{chip.label}</Badge>
            </>
          );
        })()}
        {conviction ? (
          <span title={conviction.note ?? "conviction ranking signal"}>
            <Badge tone={conviction.tone}>{conviction.label}</Badge>
          </span>
        ) : null}
        {advisory ? (
          <span className="hidden items-center rounded-pill border border-accent bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg sm:inline-flex">
            {ADVISORY_TAG}
          </span>
        ) : null}
        {liveApprovable ? (
          <span className="hidden items-center rounded-pill border border-accent bg-surface px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg sm:inline-flex">
            {LIVE_APPROVE_TAG}
          </span>
        ) : null}
        {p.sample ? <SampleDataBadge /> : null}
        <div className="ml-auto flex items-center gap-2.5">
          <Badge tone={statusTone[p.status]} dot>
            {p.status.toUpperCase()}
          </Badge>
          <ChevronRightIcon
            className="size-4 text-fg-muted transition-colors group-hover:text-fg"
            aria-hidden
          />
        </div>
      </div>

      {/* Meta line — sector · R:R · verdict · confidence */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-0.5 text-xs text-fg-muted">
        {p.sector ? <span className="truncate">{p.sector}</span> : null}
        {p.sector ? <Dot /> : null}
        <span>
          <span className="text-fg-muted">R:R </span>
          <span
            className={`font-medium tabular-nums ${
              rr ? (rr.ratio >= 2 ? "text-gain" : "text-warning") : "text-fg"
            }`}
          >
            {rr ? formatRatio(rr.ratio) : "—"}
          </span>
        </span>
        <Dot />
        {verdict ? (
          <span
            className={`rounded-pill border px-2 py-0.5 text-[0.65rem] font-semibold ${verdict.className}`}
          >
            {verdict.label}
          </span>
        ) : (
          <span className="text-fg-muted">No red-team</span>
        )}
        <Dot />
        <span className="tabular-nums">
          {conf ? `${conf.level} · ${conf.pct}%` : "Conf —"}
        </span>
      </div>
    </Link>
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
