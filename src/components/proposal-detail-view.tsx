"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { RiskRewardBar } from "@/components/risk-reward-bar";
import { ProposalResearchFreshness } from "@/components/proposal-research-freshness";
import { ProposalActions } from "@/components/proposal-actions";
import { CheckIcon, FlagIcon, ChevronRightIcon } from "@/components/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { confidenceBucket } from "@/lib/confidence";
import { convictionTierStyle } from "@/lib/conviction-style";
import { strategyStyle } from "@/lib/strategy-style";
import { STRATEGY_DESCRIPTION, STRATEGY_LABEL } from "@/lib/strategy";
import {
  buildProposalLenses,
  dualVerdictSummary,
  isDualLens,
} from "@/lib/proposal-lens";
import type { CheckStatus } from "@/lib/checklist";
import {
  ADVISORY_TAG,
  LIVE_APPROVE_TAG,
  isAdvisoryProposal,
} from "@/lib/proposal-advisory";
import type { TradeProposal } from "@/lib/types";

const statusTone: Record<TradeProposal["status"], BadgeTone> = {
  pending: "accent",
  approved: "gain",
  rejected: "loss",
  reviewed: "gain",
  dismissed: "muted",
};

/**
 * The full-context proposal **page** body (`/proposals/[id]`) — replaces the
 * read-more modal with a spacious, deep-linkable layout. Header (ticker, side,
 * strategy badge(s), status, and — for dual-lens analyses — the glanceable
 * dual-verdict summary + a Trend/Value toggle), then thesis, the strategy-aware
 * pre-trade checklist, sizing math + R:R bar, research, and the red-team
 * reasoning for the active lens. The gated approve/reject (+ re-run / refresh)
 * actions live in {@link ProposalActions} — the approval flow is unchanged.
 *
 * Dual-lens-ready: today every proposal is single-lens, so the toggle + summary
 * stay dormant; once a dual-lens analysis attaches a second lens they light up
 * (see `buildProposalLenses`). No data-model change — presentation only.
 */
export function ProposalDetailView({
  proposal: p,
  liveEnabled,
}: {
  proposal: TradeProposal;
  liveEnabled: boolean;
}) {
  const lenses = buildProposalLenses(p);
  const dual = isDualLens(lenses);
  const [activeIdx, setActiveIdx] = useState(0);
  const lens = lenses[activeIdx] ?? lenses[0];

  const advisory = isAdvisoryProposal(p);
  const liveApprovable = p.account === "live" && !advisory;
  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  const conf = p.confidence === null ? null : confidenceBucket(p.confidence);
  const estCost = p.qty * p.limitPrice;
  const riskPerShare =
    p.stopPrice === null ? null : Math.abs(p.limitPrice - p.stopPrice);
  const totalRisk = riskPerShare === null ? null : riskPerShare * p.qty;
  const created = new Date(p.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/proposals"
          className="inline-flex items-center gap-1 text-sm font-medium text-link transition-colors hover:text-link-hover"
        >
          <ChevronRightIcon className="size-4 rotate-180" aria-hidden /> All
          proposals
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={p.action === "buy" ? "gain" : "loss"} solid>
            {p.action.toUpperCase()}
          </Badge>
          <h1 className="font-serif text-3xl font-semibold leading-none text-fg">
            {p.symbol}
          </h1>
          {lenses.map((l) => (
            <Badge key={l.strategy} tone={strategyStyle[l.strategy].tone}>
              {strategyStyle[l.strategy].label}
            </Badge>
          ))}
          {p.convictionTier ? (
            <Badge tone={convictionTierStyle[p.convictionTier].tone}>
              {convictionTierStyle[p.convictionTier].label}
            </Badge>
          ) : null}
          {advisory ? (
            <span className="inline-flex items-center rounded-pill border border-accent bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg">
              {ADVISORY_TAG}
            </span>
          ) : null}
          {liveApprovable ? (
            <span className="inline-flex items-center rounded-pill border border-accent bg-surface px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-fg">
              {LIVE_APPROVE_TAG}
            </span>
          ) : null}
          <div className="ml-auto">
            <Badge tone={statusTone[p.status]} dot>
              {p.status.toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
          {p.sector ? <span>{p.sector}</span> : null}
          {p.sector ? <Dot /> : null}
          <span>
            {p.action} {p.side} · {p.qty} @ {formatCurrency(p.limitPrice)}
          </span>
          <Dot />
          <span>
            Proposed{" "}
            <time dateTime={p.createdAt}>
              {created.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          </span>
        </div>

        {/* Dual-verdict summary + lens toggle — only when a proposal carries
            more than one lens (dormant until dual-lens analyses exist). */}
        {dual ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-fg">
              {dualVerdictSummary(lenses)}
            </span>
            <div
              className="inline-flex overflow-hidden rounded-pill border border-line"
              role="group"
              aria-label="Strategy lens"
            >
              {lenses.map((l, i) => (
                <button
                  key={l.strategy}
                  type="button"
                  title={STRATEGY_DESCRIPTION[l.strategy]}
                  aria-pressed={activeIdx === i}
                  onClick={() => setActiveIdx(i)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                    activeIdx === i
                      ? "bg-accent/15 text-fg"
                      : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
                  }`}
                >
                  {STRATEGY_LABEL[l.strategy]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title="Thesis">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={strategyStyle[lens.strategy].tone}>
                {strategyStyle[lens.strategy].label} mandate
              </Badge>
              <span className="text-xs text-fg-muted">
                {STRATEGY_DESCRIPTION[lens.strategy]}
              </span>
            </div>
            <p className="text-pretty text-sm leading-relaxed text-fg">
              {p.thesis}
            </p>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-muted">
              {p.reasoning}
            </p>
          </Section>

          <Section
            title="Pre-trade checklist"
            note={
              dual
                ? `Judged under the ${STRATEGY_LABEL[lens.strategy].toLowerCase()} mandate.`
                : undefined
            }
          >
            <ul className="flex flex-col gap-2">
              {lens.checklist.map((c) => (
                <li
                  key={c.label}
                  className="flex items-center gap-3 rounded-input border border-line bg-surface px-3 py-2"
                >
                  <CheckChip status={c.status} />
                  <span className="text-sm text-fg">{c.label}</span>
                  <span className="ml-auto text-sm tabular-nums text-fg-muted">
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Research">
            {p.catalyst ? (
              <p className="text-pretty text-sm leading-relaxed text-fg">
                {p.catalyst}
              </p>
            ) : (
              <p className="text-sm text-fg-muted">
                No named catalyst recorded on this proposal.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ProposalResearchFreshness symbol={p.symbol} />
              <Link
                href={`/symbol/${p.symbol}`}
                className="text-sm font-medium text-link transition-colors hover:text-link-hover"
              >
                Full {p.symbol} research <span aria-hidden>→</span>
              </Link>
            </div>
          </Section>

          <Section
            title="Red-team reasoning"
            note={
              dual
                ? `The ${STRATEGY_LABEL[lens.strategy].toLowerCase()} prosecutor's verdict.`
                : undefined
            }
          >
            {lens.redTeam ? (
              <RedTeamVerdict verdict={lens.redTeam} />
            ) : (
              <p className="text-sm text-fg-muted">
                The cross-model red-team hasn&apos;t judged this lens yet.
              </p>
            )}
          </Section>
        </div>

        {/* Side rail — sizing math + the gated actions. */}
        <div className="flex flex-col gap-6">
          <Section title="Sizing math">
            <RiskRewardBar
              action={p.action}
              entry={p.limitPrice}
              stop={p.stopPrice}
              target={p.takeProfit}
              confidence={p.confidence}
              className="mb-1"
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <MathRow
                label="Quantity × limit"
                value={`${p.qty} × ${formatCurrency(p.limitPrice)}`}
              />
              <MathRow label="Estimated cost" value={formatCurrency(estCost)} />
              <MathRow
                label="Risk per share"
                value={riskPerShare === null ? "—" : formatCurrency(riskPerShare)}
              />
              <MathRow
                label="Total risk to stop"
                value={totalRisk === null ? "—" : formatCurrency(totalRisk)}
              />
              <MathRow
                label="Risk (% equity)"
                value={formatPercent(p.riskPct, { signed: false })}
              />
              <MathRow
                label="Reward : risk"
                value={rr ? formatRatio(rr.ratio) : "—"}
              />
              <MathRow
                label="Model confidence"
                value={conf ? `${conf.level} · ${conf.pct}%` : "—"}
              />
            </dl>
          </Section>

          <Section title="Decision">
            <ProposalActions proposal={p} liveEnabled={liveEnabled} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/** A titled block on the detail page — a serif sub-heading + an optional note. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-raised p-5">
      <div>
        <h2 className="font-serif text-base font-semibold text-fg">{title}</h2>
        {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Pass/flag chip for a checklist item. Semantic tones, never the brand accent;
 *  `na` stays neutral so an unknown signal never reads as a pass. */
function CheckChip({ status }: { status: CheckStatus }) {
  if (status === "pass") {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-success-surface text-success">
        <CheckIcon className="size-3.5" aria-label="Pass" />
      </span>
    );
  }
  if (status === "flag") {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-warning-surface text-warning">
        <FlagIcon className="size-3" aria-label="Flag" />
      </span>
    );
  }
  return (
    <span
      aria-label="Not applicable"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-fg-muted/10 text-xs font-semibold text-fg-muted"
    >
      –
    </span>
  );
}

/** One labelled figure in the sizing-math grid. */
function MathRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-fg">{value}</dd>
    </>
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
