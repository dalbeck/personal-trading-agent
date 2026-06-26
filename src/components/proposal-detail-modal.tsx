"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { RiskRewardBar } from "@/components/risk-reward-bar";
import { ProposalResearchFreshness } from "@/components/proposal-research-freshness";
import { CheckIcon, FlagIcon } from "@/components/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { confidenceBucket } from "@/lib/confidence";
import { buildChecklist, type CheckStatus } from "@/lib/checklist";
import { strategyStyle } from "@/lib/strategy-style";
import { STRATEGY_DESCRIPTION } from "@/lib/strategy";
import type { TradeProposal } from "@/lib/types";

/**
 * Full proposal context in a formatted, sectioned modal (M5) — the "Read more"
 * target that keeps the card scannable. Sections: thesis, a derived pre-trade
 * checklist (pass/flag chips), the sizing math, research highlights, and the
 * full red-team reasoning. The checklist thresholds come from the charter
 * (`RISK_LIMITS`) and the documented signal floors — never hardcoded policy.
 */
export function ProposalDetailModal({
  proposal,
  open,
  onDismiss,
  actions,
}: {
  proposal: TradeProposal | null;
  open: boolean;
  onDismiss: () => void;
  /** Pinned action bar (approve/reject/review) — the table is slim, so the
   *  decisions live here on the full-context modal (M8). */
  actions?: ReactNode;
}) {
  const p = proposal;
  if (!p) {
    return <Modal open={open} title="Proposal" onDismiss={onDismiss} />;
  }

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

  const checklist = buildChecklist(p);
  const strat = strategyStyle[p.strategy];

  return (
    <Modal
      open={open}
      title={`${p.action.toUpperCase()} ${p.symbol} — full context`}
      onDismiss={onDismiss}
      footer={actions}
    >
      <div className="flex flex-col gap-6">
        <DetailSection title="Thesis">
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={strat.tone}>{strat.label} mandate</Badge>
            <span className="text-xs text-fg-muted">
              {STRATEGY_DESCRIPTION[p.strategy]}
            </span>
          </div>
          <p className="text-pretty text-sm leading-relaxed text-fg">
            {p.thesis}
          </p>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-muted">
            {p.reasoning}
          </p>
        </DetailSection>

        <DetailSection title="Pre-trade checklist">
          <ul className="flex flex-col gap-2">
            {checklist.map((c) => (
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
        </DetailSection>

        <DetailSection title="Sizing math">
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
              value={
                riskPerShare === null ? "—" : formatCurrency(riskPerShare)
              }
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
        </DetailSection>

        <DetailSection title="Research">
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
        </DetailSection>

        {p.redTeam ? (
          <DetailSection title="Red-team reasoning">
            <RedTeamVerdict verdict={p.redTeam} />
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
