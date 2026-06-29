"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { RiskRewardBar } from "@/components/risk-reward-bar";
import { CashFlowBlock } from "@/components/cash-flow-block";
import { DividendBlock } from "@/components/dividend-block";
import { ProposalResearchFreshness } from "@/components/proposal-research-freshness";
import { ProposalLevelsFreshness } from "@/components/proposal-levels-freshness";
import { ProposalActions } from "@/components/proposal-actions";
import { ProposalExportActions } from "@/components/proposal-export-actions";
import { ApprovalProximityMeter } from "@/components/approval-proximity-meter";
import {
  ProposalSourcesCard,
  SourceMarker,
} from "@/components/proposal-sources-card";
import { buildProposalSources } from "@/lib/proposal-sources";
import { StagedEntryPlanCard } from "@/components/staged-entry-plan";
import { CheckIcon, FlagIcon, ChevronRightIcon } from "@/components/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { confidenceBucket } from "@/lib/confidence";
import { convictionDisplay } from "@/lib/conviction-display";
import { redTeamVerdictStyle } from "@/lib/red-team-style";
import { strategyStyle, sleeveStyle } from "@/lib/strategy-style";
import { STRATEGY_DESCRIPTION, STRATEGY_LABEL } from "@/lib/strategy";
import { HORIZON_LABEL, SLEEVE_LABEL, SLEEVES, horizonOf } from "@/lib/sleeves";
import {
  buildProposalLenses,
  isDualLens,
  lensSleeveOf,
  multiVerdictSummary,
} from "@/lib/proposal-lens";
import { hasCashFlowData } from "@/lib/cash-flow";
import { hasDividendData } from "@/lib/dividend";
import { isResearchUnavailable } from "@/lib/research-availability";
import { catalystSourceDate } from "@/lib/catalyst-source";
import {
  CATALYST_NONE_PROSE,
  CATALYST_UNAVAILABLE_PROSE,
  isCatalystUnavailable,
  resolveCatalystState,
} from "@/lib/catalyst-state";
import { ResearchUnavailableNotice } from "@/components/research-unavailable-notice";
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
  taxAdvisory,
}: {
  proposal: TradeProposal;
  liveEnabled: boolean;
  /** Wash-sale + nearly-long-term sell notes (tax-awareness M6). Advisory only. */
  taxAdvisory?: {
    washSale: { reason: string } | null;
    nearLongTerm: string | null;
  };
}) {
  const lenses = buildProposalLenses(p);
  const dual = isDualLens(lenses);
  // Default the toggle to the proposal's ACTIVE lens (its top-level strategy =
  // the higher-conviction default), so the detail opens on the same lens the
  // slim list shows. Falls back to the first lens.
  const defaultIdx = Math.max(
    0,
    lenses.findIndex((l) => l.strategy === p.strategy),
  );
  const [activeIdx, setActiveIdx] = useState(defaultIdx);
  const lens = lenses[activeIdx] ?? lenses[0];

  // Per-metric source provenance (proposal-source-footnotes M1) — lens-aware, so
  // the markers + Sources card follow the Trend/Value toggle (cash-flow /
  // dividend provider + catalyst sources live on the active lens).
  const sources = buildProposalSources(p, lens);

  const advisory = isAdvisoryProposal(p);
  const liveApprovable = p.account === "live" && !advisory;
  // Levels/sizing/thesis/research follow the ACTIVE lens, so the toggle switches
  // the whole breakdown (single-lens proposals have one lens == the top-level).
  const rr = computeRiskReward({
    action: p.action,
    entry: lens.limitPrice,
    stop: lens.stopPrice,
    target: lens.takeProfit,
  });
  const conf =
    lens.confidence === null ? null : confidenceBucket(lens.confidence);
  // Conviction paired with the active (top-level) lens's verdict — secondary to
  // the verdict, muted + flagged on a reject (conviction-honesty M1).
  const conviction = convictionDisplay(p.convictionTier, p.redTeam?.verdict);
  const estCost = lens.qty * lens.limitPrice;
  const riskPerShare =
    lens.stopPrice === null ? null : Math.abs(lens.limitPrice - lens.stopPrice);
  const totalRisk = riskPerShare === null ? null : riskPerShare * lens.qty;
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

      {/* Tax advisory (tax-awareness M6) — surfaced cautions, never a block. */}
      {taxAdvisory?.washSale || taxAdvisory?.nearLongTerm ? (
        <div className="rounded-card border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            Tax caution · advisory
          </p>
          {taxAdvisory.washSale ? (
            <p className="mt-1 text-sm text-fg">{taxAdvisory.washSale.reason}</p>
          ) : null}
          {taxAdvisory.nearLongTerm ? (
            <p className="mt-1 text-sm text-fg">{taxAdvisory.nearLongTerm}</p>
          ) : null}
          <p className="mt-1.5 text-xs text-fg-muted">
            Informational only — it does not block the trade, and the desk never
            selects lots or optimizes taxes for you.
          </p>
        </div>
      ) : null}

      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={p.action === "buy" ? "gain" : "loss"} solid>
            {p.action.toUpperCase()}
          </Badge>
          <h1 className="font-serif text-3xl font-semibold leading-none text-fg">
            <Link
              href={`/symbol/${p.symbol}`}
              title={`Open ${p.symbol} research`}
              className="rounded-[3px] underline-offset-4 transition-colors hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {p.symbol}
            </Link>
          </h1>
          {lenses.map((l) => {
            const s = lensSleeveOf(l);
            return (
              <Badge key={s} tone={sleeveStyle[s].tone}>
                {sleeveStyle[s].label}
              </Badge>
            );
          })}
          {/* Red-team verdict is the HEADLINE (conviction-honesty M1) — a
              semantic pill (reject → danger), so a rejected proposal reads as
              rejected at a glance, not reassuring. */}
          {p.redTeam ? (
            <span
              className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-semibold ${redTeamVerdictStyle[p.redTeam.verdict].className}`}
              title="Cross-model red-team verdict — the headline; conviction below is a secondary ranking signal."
            >
              Red-team: {redTeamVerdictStyle[p.redTeam.verdict].label}
            </span>
          ) : null}
          {/* Conviction is a SECONDARY ranking signal — muted + flagged when the
              red-team rejects (never a bare green "high" on a rejected proposal). */}
          {conviction ? (
            <span title={conviction.note ?? "conviction ranking / sort signal"}>
              <Badge tone={conviction.tone}>{conviction.label}</Badge>
            </span>
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
            {p.action} {p.side} · {lens.qty} @ {formatCurrency(lens.limitPrice)}
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

        {/* Multi-sleeve verdict matrix + lens toggle (verdict-matrix M7) — only
            when a proposal carries more than one lens. The matrix shows every
            evaluated sleeve's red-team verdict; the toggle picks the ACTING lens. */}
        {dual ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">
              {multiVerdictSummary(lenses)}
            </span>
            <VerdictMatrix
              lenses={lenses}
              activeIdx={activeIdx}
              onPick={setActiveIdx}
            />
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
              {lens.thesis}
            </p>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-muted">
              {lens.reasoning}
            </p>
          </Section>

          <Section
            title="Pre-trade checklist"
            marker={<SourceMarker source={sources.sourceFor("technical")} />}
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

          {lens.strategy === "value" &&
          (hasCashFlowData(lens.cashFlow) ||
            isResearchUnavailable(lens.researchStatus)) ? (
            <Section
              title="Cash-flow quality"
              marker={<SourceMarker source={sources.sourceFor("cashFlow")} />}
              note="The value floor-vs-trap signal — does the business fund itself?"
            >
              {hasCashFlowData(lens.cashFlow) ? (
                <CashFlowBlock cashFlow={lens.cashFlow} sector={p.sector} />
              ) : (
                <ResearchUnavailableNotice
                  status={lens.researchStatus}
                  reason={lens.researchStatusReason}
                  field="Cash-flow quality"
                />
              )}
            </Section>
          ) : null}

          {lens.strategy === "value" && hasDividendData(lens.dividend) ? (
            <Section
              title="Dividend sustainability"
              marker={<SourceMarker source={sources.sourceFor("dividend")} />}
              note="Is the dividend a real floor — paid to wait, or a value trap?"
            >
              <DividendBlock dividend={lens.dividend} />
            </Section>
          ) : null}

          {!advisory ? (
            <Section
              title="Staged entry"
              note="Optional DCA / scale-in — risk sized on the full position; each tranche a separate gated approval."
            >
              <StagedEntryPlanCard proposal={p} />
            </Section>
          ) : null}

          <Section
            title="Research"
            marker={<SourceMarker source={sources.sourceFor("catalyst")} />}
          >
            {lens.catalyst ? (
              <p className="text-pretty text-sm leading-relaxed text-fg">
                {lens.catalyst}
              </p>
            ) : isCatalystUnavailable(
                resolveCatalystState({
                  catalyst: lens.catalyst,
                  catalystState: lens.catalystState,
                }),
              ) ? (
              <p className="text-sm font-medium text-warning-fg">
                {CATALYST_UNAVAILABLE_PROSE}
              </p>
            ) : (
              <p className="text-sm text-fg-muted">{CATALYST_NONE_PROSE}</p>
            )}
            {lens.catalystSources.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Catalyst sources
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {lens.catalystSources.map((s, i) => {
                    const date = catalystSourceDate(s);
                    const meta = [s.publisher, date].filter(Boolean).join(" · ");
                    return (
                      <li key={`${s.url ?? s.headline}-${i}`} className="text-sm leading-snug">
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-link transition-colors hover:text-link-hover"
                          >
                            {s.headline}
                          </a>
                        ) : (
                          <span className="text-fg">{s.headline}</span>
                        )}
                        {meta ? (
                          <span className="text-fg-subtle"> — {meta}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ProposalResearchFreshness
                symbol={p.symbol}
                proposalId={p.id}
                researchAt={p.researchAt ?? p.createdAt}
                rebuildable={p.origin === "manual-request"}
              />
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

        {/* Side rail — at-a-glance approval proximity, sizing math, gated actions. */}
        <div className="flex flex-col gap-6">
          {/* Read-only quick read of how close the red-team is to approval. The
              red-team detail block stays in the main column, untouched. Reads the
              ACTIVE lens, so it re-derives with the Trend/Value toggle. */}
          <ApprovalProximityMeter lens={lens} />

          <Section
            title="Sizing math"
            marker={<SourceMarker source={sources.sourceFor("technical")} />}
            note={
              dual
                ? `For the ${STRATEGY_LABEL[lens.strategy].toLowerCase()} lens — approving uses these levels.`
                : undefined
            }
          >
            <ProposalLevelsFreshness
              proposalId={p.id}
              symbol={p.symbol}
              entry={lens.limitPrice}
              pricedAt={p.pricedAt}
              createdAt={p.createdAt}
            />
            <RiskRewardBar
              action={p.action}
              entry={lens.limitPrice}
              stop={lens.stopPrice}
              target={lens.takeProfit}
              confidence={lens.confidence}
              className="mb-1 mt-1"
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <MathRow
                label="Quantity × limit"
                value={`${lens.qty} × ${formatCurrency(lens.limitPrice)}`}
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
                value={formatPercent(lens.riskPct, { signed: false })}
              />
              <MathRow
                label="Reward : risk"
                value={rr ? formatRatio(rr.ratio) : "—"}
                marker={<SourceMarker source={sources.sourceFor("derived")} />}
              />
              <MathRow
                label="Model confidence"
                value={conf ? `${conf.level} · ${conf.pct}%` : "—"}
              />
            </dl>
          </Section>

          <Section title="Decision">
            <ProposalActions
              proposal={p}
              liveEnabled={liveEnabled}
              activeLens={lensSleeveOf(lens)}
              dual={dual}
            />
          </Section>

          <Section title="Export">
            <p className="text-xs text-fg-muted">
              Download or copy the full context — a point-in-time snapshot,{" "}
              <span className="whitespace-nowrap">not investment advice.</span>
            </p>
            <ProposalExportActions proposal={p} />
          </Section>

          {/* Source footnotes (proposal-source-footnotes M1) — the canonical
              numbered registry the superscript markers jump to. Directly under
              Export; on narrow screens the sidebar stacks below the main column,
              so the sources land at the bottom of the page. Single source of
              truth — rendered once. */}
          <ProposalSourcesCard sources={sources} />
        </div>
      </div>
    </div>
  );
}

/** A titled block on the detail page — a serif sub-heading + an optional note.
 *  `marker` renders inline after the title (the source footnote marker). */
function Section({
  title,
  note,
  marker,
  children,
}: {
  title: string;
  note?: string;
  marker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface-raised p-5">
      <div>
        <h2 className="font-serif text-base font-semibold text-fg">
          {title}
          {marker}
        </h2>
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

/** One labelled figure in the sizing-math grid. `marker` (optional) renders the
 *  source footnote marker inline after the label. */
function MathRow({
  label,
  value,
  marker,
}: {
  label: string;
  value: string;
  marker?: ReactNode;
}) {
  return (
    <>
      <dt className="text-fg-muted">
        {label}
        {marker}
      </dt>
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

/** The lens's key levels for the verdict matrix — entry + (stop/target) for a
 *  risk-to-stop lens, or entry + target weight for a core target-weight lens. */
function lensLevels(
  lens: ReturnType<typeof buildProposalLenses>[number],
): string {
  if (lens.targetWeightPct != null) {
    return `${formatCurrency(lens.limitPrice)} · ${formatPercent(lens.targetWeightPct, { signed: false })} wt`;
  }
  const parts = [formatCurrency(lens.limitPrice)];
  if (lens.stopPrice != null) parts.push(`stop ${formatCurrency(lens.stopPrice)}`);
  if (lens.takeProfit != null) parts.push(`tgt ${formatCurrency(lens.takeProfit)}`);
  return parts.join(" · ");
}

/**
 * The sleeve × verdict matrix (verdict-matrix M7). One row per sleeve: an
 * evaluated sleeve shows its red-team verdict, key levels, and conviction; a
 * sleeve the human didn't select reads "not evaluated" — never a fake pass.
 * Clicking an evaluated row picks it as the ACTING lens (what approval uses).
 */
function VerdictMatrix({
  lenses,
  activeIdx,
  onPick,
}: {
  lenses: ReturnType<typeof buildProposalLenses>;
  activeIdx: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line bg-surface-raised text-left text-fg-muted">
            <th className="px-3 py-2 font-medium">Sleeve</th>
            <th className="px-3 py-2 font-medium">Red-team</th>
            <th className="px-3 py-2 text-right font-medium">Levels</th>
            <th className="px-3 py-2 text-right font-medium">Conviction</th>
          </tr>
        </thead>
        <tbody>
          {SLEEVES.map((sleeve) => {
            const idx = lenses.findIndex((l) => lensSleeveOf(l) === sleeve);
            const lens = idx >= 0 ? lenses[idx] : null;
            const isActive = idx === activeIdx;
            return (
              <tr
                key={sleeve}
                onClick={lens ? () => onPick(idx) : undefined}
                aria-pressed={isActive}
                className={`border-b border-line/60 last:border-0 ${
                  lens ? "cursor-pointer hover:bg-surface-overlay" : "opacity-60"
                } ${isActive ? "bg-accent/10" : ""}`}
              >
                <td className="px-3 py-2">
                  <span className="font-medium text-fg">{SLEEVE_LABEL[sleeve]}</span>{" "}
                  <span className="text-fg-muted">{HORIZON_LABEL[horizonOf(sleeve)]}</span>
                  {isActive ? (
                    <span className="ml-1 font-medium text-accent">· acting</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {lens?.redTeam ? (
                    <span
                      className={`inline-flex items-center rounded-pill border px-2 py-0.5 font-semibold ${redTeamVerdictStyle[lens.redTeam.verdict].className}`}
                    >
                      {redTeamVerdictStyle[lens.redTeam.verdict].label}
                    </span>
                  ) : lens ? (
                    <span className="text-fg-muted">not run</span>
                  ) : (
                    <span className="text-fg-subtle">not evaluated</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                  {lens ? lensLevels(lens) : "—"}
                </td>
                <td className="px-3 py-2 text-right capitalize text-fg-muted">
                  {lens?.convictionTier ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
