"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/page-shell";
import { ProposalDetailModal } from "@/components/proposal-detail-modal";
import { RedTeamRerunButton } from "@/components/red-team-rerun-button";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { RiskRewardBar } from "@/components/risk-reward-bar";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { TickerLink } from "@/components/ticker-link";
import { Term } from "@/components/term";
import { formatCurrency, formatPercent } from "@/lib/format";
import { confidenceBucket } from "@/lib/confidence";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import {
  ADVISORY_TAG,
  LIVE_APPROVE_TAG,
  isAdvisoryProposal,
  type AdvisoryDecision,
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

const advisoryStatusLabel: Partial<Record<Status, string>> = {
  reviewed: "Reviewed",
  dismissed: "Dismissed",
};

interface DecisionResult {
  outcome:
    | "approved"
    | "denied"
    | "blocked-risk"
    | "blocked-redteam"
    | "blocked-caps"
    | "error";
  destination?: "robinhood" | "alpaca-paper" | "mock";
  brokerOrderId?: string;
  dryRun: boolean;
}

const outcomeLabel: Record<DecisionResult["outcome"], string> = {
  approved: "Approved",
  denied: "Denied (journaled)",
  "blocked-risk": "Blocked by risk rails",
  "blocked-redteam": "Blocked by red-team",
  "blocked-caps": "Blocked by live caps",
  error: "Order error (still pending)",
};

interface Violation {
  rule: string;
  message: string;
}

interface PrecheckResult {
  redTeamRejects: boolean;
  redTeamNotes: string | null;
  railViolations: Violation[];
  capViolations: Violation[];
  liveEnabled: boolean;
  blocked: boolean;
}

export function ProposalsList({
  proposals,
  liveEnabled,
}: {
  proposals: TradeProposal[];
  liveEnabled: boolean;
}) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, DecisionResult>>({});
  const [advResults, setAdvResults] = useState<
    Record<string, AdvisoryDecision>
  >({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<{
    loading: boolean;
    result: PrecheckResult | null;
  }>({ loading: false, result: null });
  const [overrideComment, setOverrideComment] = useState("");

  const statusOf = (p: TradeProposal): Status => {
    const adv = advResults[p.id];
    if (adv) return adv;
    const r = results[p.id];
    if (!r) return p.status;
    return r.outcome === "approved" ? "approved" : "rejected";
  };

  async function decide(
    id: string,
    decision: "approve" | "deny",
    overrideCommentText?: string,
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/live/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: id,
          decision,
          ...(overrideCommentText && overrideCommentText.trim()
            ? { override: { comment: overrideCommentText.trim() } }
            : {}),
        }),
      });
      const data = (await res.json()) as DecisionResult & { error?: string };
      if (res.ok) {
        setResults((r) => ({ ...r, [id]: data }));
        router.refresh();
      }
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  // Open the approve dialog and run the read-only precheck so the 2-step
  // override can show exactly what (if anything) is blocking the order. All
  // state writes happen after an await — never synchronously in an effect.
  async function openConfirm(id: string) {
    setConfirmId(id);
    setOverrideComment("");
    setPrecheck({ loading: true, result: null });
    try {
      const res = await fetch("/api/live/approve/precheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: id }),
      });
      const data = res.ok ? ((await res.json()) as PrecheckResult) : null;
      setPrecheck({ loading: false, result: data });
    } catch {
      setPrecheck({ loading: false, result: null });
    }
  }

  // Advisory proposals never touch the order path: this records the human's
  // review/dismiss via the status-only endpoint (no /api/live/approve).
  async function review(id: string, decision: AdvisoryDecision) {
    setBusyId(id);
    try {
      const res = await fetch("/api/proposals/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: id, decision }),
      });
      if (res.ok) {
        setAdvResults((r) => ({ ...r, [id]: decision }));
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  const confirmProposal = proposals.find((p) => p.id === confirmId) ?? null;
  const detailProposal = proposals.find((p) => p.id === detailId) ?? null;
  const confirmRr = confirmProposal
    ? computeRiskReward({
        action: confirmProposal.action,
        entry: confirmProposal.limitPrice,
        stop: confirmProposal.stopPrice,
        target: confirmProposal.takeProfit,
      })
    : null;
  const confirmConf =
    confirmProposal && confirmProposal.confidence !== null
      ? confidenceBucket(confirmProposal.confidence)
      : null;
  // The precheck (read-only) tells us exactly what is blocking the order, so the
  // dialog can require a typed justification before "Override & approve".
  const blocks = precheck.result;
  const blocked = blocks?.blocked ?? false;
  const overrideReady = overrideComment.trim().length > 0;
  const confirmBlocked =
    busyId !== null || precheck.loading || (blocked && !overrideReady);

  return (
    <>
      <div className="flex flex-col gap-5">
        {proposals.map((p) => {
          const status = statusOf(p);
          const pending = status === "pending";
          const result = results[p.id];
          const advisory = isAdvisoryProposal(p);
          const liveApprovable = p.account === "live" && !advisory;
          const estCost = p.qty * p.limitPrice;
          const rr = computeRiskReward({
            action: p.action,
            entry: p.limitPrice,
            stop: p.stopPrice,
            target: p.takeProfit,
          });
          const conf =
            p.confidence === null ? null : confidenceBucket(p.confidence);
          return (
            <Card
              key={p.id}
              interactive
              className={`overflow-hidden p-0 ${advisory ? "border-accent/50" : ""}`}
            >
              {/* Zone 1 — tinted header strip: side pill, serif ticker, status */}
              <div className="tint-strip flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge tone={p.action === "buy" ? "gain" : "loss"} solid>
                    {p.action.toUpperCase()}
                  </Badge>
                  <TickerLink
                    symbol={p.symbol}
                    className="font-serif text-lg font-semibold text-fg"
                  />
                  <span className="text-sm tabular-nums text-fg-muted">
                    {p.qty} @ {formatCurrency(p.limitPrice)} limit
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {advisory ? (
                    <span className="inline-flex items-center rounded-pill border border-accent bg-accent/10 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-fg">
                      {ADVISORY_TAG}
                    </span>
                  ) : null}
                  {liveApprovable ? (
                    <span className="inline-flex items-center rounded-pill border border-accent bg-surface px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-fg">
                      {LIVE_APPROVE_TAG}
                    </span>
                  ) : null}
                  {p.sample ? <SampleDataBadge /> : null}
                  <Badge tone={statusTone[status]} dot>
                    {status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-5">
                {/* Zone 2 — thesis as a readable lead line */}
                <p className="text-pretty text-[0.95rem] leading-relaxed text-fg">
                  {p.thesis}
                </p>

                {/* Zone 3 — key stats chip row */}
                <div className="flex flex-wrap gap-2">
                  <StatChip label="Est. cost" value={formatCurrency(estCost)} />
                  <StatChip
                    label="Risk"
                    value={formatPercent(p.riskPct, { signed: false })}
                  />
                  <StatChip
                    label="R:R"
                    value={rr ? formatRatio(rr.ratio) : "—"}
                    tone={rr ? (rr.ratio >= 2 ? "gain" : "warning") : "default"}
                  />
                  <StatChip
                    label="Confidence"
                    value={conf ? `${conf.level} · ${conf.pct}%` : "—"}
                  />
                </div>

                {/* Zone 4 — R:R bar, the card's hero visual */}
                <RiskRewardBar
                  action={p.action}
                  entry={p.limitPrice}
                  stop={p.stopPrice}
                  target={p.takeProfit}
                  confidence={p.confidence}
                  className=""
                />

                {/* Zone 5 — red-team verdict, a distinct semantic callout */}
                {p.redTeam ? <RedTeamVerdict verdict={p.redTeam} /> : null}

                {/* Zone 6 — full context (reasoning, pre-trade checklist,
                    sizing math, research, full red-team) in a formatted modal,
                    keeping the card itself scannable. */}
                <div>
                  <button
                    type="button"
                    onClick={() => setDetailId(p.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-link transition-colors hover:text-link-hover"
                  >
                    Read more — checklist, sizing &amp; research
                    <span aria-hidden>→</span>
                  </button>
                </div>

                {/* Zone 7 — actions */}
                {advisory ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {pending ? (
                      <>
                        <span className="mr-auto text-pretty text-xs text-fg-muted">
                          Advisory only — no automated execution. Place this
                          trade yourself in Robinhood if you agree.
                        </span>
                        <RedTeamRerunButton proposalId={p.id} />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => review(p.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => review(p.id, "reviewed")}
                        >
                          Mark reviewed
                        </Button>
                      </>
                    ) : (
                      <span className="ml-auto text-xs text-fg-muted">
                        {advisoryStatusLabel[status] ?? status}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {pending ? (
                      <>
                        <div className="mr-auto">
                          <RedTeamRerunButton proposalId={p.id} />
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => decide(p.id, "deny")}
                        >
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => openConfirm(p.id)}
                        >
                          Approve…
                        </Button>
                      </>
                    ) : (
                      <span className="ml-auto text-xs text-fg-muted">
                        {result ? (
                          <>
                            {outcomeLabel[result.outcome]}
                            {result.outcome === "approved" ? (
                              <>
                                {" "}
                                · routed to{" "}
                                <span className="font-medium text-fg">
                                  {result.destination}
                                </span>
                                {result.dryRun ? " (dry-run sink)" : " (LIVE)"}
                                {result.brokerOrderId ? (
                                  <> · {result.brokerOrderId}</>
                                ) : null}
                              </>
                            ) : null}
                          </>
                        ) : status === "approved" ? (
                          "Approved"
                        ) : (
                          "Rejected"
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={confirmProposal !== null}
        size="lg"
        title={
          confirmProposal
            ? `Approve ${confirmProposal.action.toUpperCase()} ${confirmProposal.symbol}?`
            : "Approve order?"
        }
        description={
          liveEnabled
            ? "⚠ LIVE TRADING IS ON — approving places a REAL order with REAL money."
            : "Harness gate is closed. Approving routes this order to the dry-run sink (paper / mock broker) — no real money, never Robinhood."
        }
        confirmLabel={
          busyId
            ? "Routing…"
            : precheck.loading
              ? "Checking rails…"
              : blocked
                ? "Override & approve"
                : liveEnabled
                  ? "Approve — place LIVE order"
                  : "Approve (dry-run)"
        }
        confirmVariant={blocked || liveEnabled ? "danger" : "primary"}
        confirmDisabled={confirmBlocked}
        onConfirm={() =>
          confirmProposal &&
          decide(
            confirmProposal.id,
            "approve",
            blocked ? overrideComment : undefined,
          )
        }
        onDismiss={() => setConfirmId(null)}
      >
        {confirmProposal ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-line bg-surface p-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-fg-muted">Ticker</dt>
                <dd className="text-right font-medium text-fg">
                  {confirmProposal.symbol}
                </dd>
                <dt className="text-fg-muted">Side / action</dt>
                <dd className="text-right tabular-nums text-fg">
                  {confirmProposal.action} · {confirmProposal.side}
                </dd>
                <dt className="text-fg-muted">Quantity</dt>
                <dd className="text-right tabular-nums text-fg">
                  {confirmProposal.qty}
                </dd>
                <dt className="text-fg-muted">Order type</dt>
                <dd className="text-right text-fg">
                  <Term term="marketable-limit">marketable-limit</Term>
                </dd>
                <dt className="text-fg-muted">Limit price</dt>
                <dd className="text-right tabular-nums text-fg">
                  {formatCurrency(confirmProposal.limitPrice)}
                </dd>
                <dt className="text-fg-muted">Est. cost</dt>
                <dd className="text-right tabular-nums text-fg">
                  {formatCurrency(
                    confirmProposal.qty * confirmProposal.limitPrice,
                  )}
                </dd>
                {confirmProposal.stopPrice !== null ? (
                  <>
                    <dt className="text-fg-muted">Stop</dt>
                    <dd className="text-right tabular-nums text-fg">
                      {formatCurrency(confirmProposal.stopPrice)}
                    </dd>
                  </>
                ) : null}
              </dl>

              <p className="mt-3 border-t border-line pt-3 text-pretty text-sm text-fg">
                {confirmProposal.thesis}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatChip
                label="Est. cost"
                value={formatCurrency(
                  confirmProposal.qty * confirmProposal.limitPrice,
                )}
              />
              <StatChip
                label="Risk"
                value={formatPercent(confirmProposal.riskPct, {
                  signed: false,
                })}
              />
              <StatChip
                label="R:R"
                value={confirmRr ? formatRatio(confirmRr.ratio) : "—"}
                tone={
                  confirmRr
                    ? confirmRr.ratio >= 2
                      ? "gain"
                      : "warning"
                    : "default"
                }
              />
              <StatChip
                label="Confidence"
                value={
                  confirmConf ? `${confirmConf.level} · ${confirmConf.pct}%` : "—"
                }
              />
            </div>

            {confirmProposal.redTeam ? (
              <RedTeamVerdict verdict={confirmProposal.redTeam} />
            ) : null}

            {precheck.loading ? (
              <p className="text-sm text-fg-muted">
                Checking the risk rails and red-team…
              </p>
            ) : blocked && blocks ? (
              <div className="rounded-card border border-danger-border bg-danger-surface p-4">
                <p className="text-sm font-semibold text-danger">
                  This order is blocked by a safeguard. Overriding is a
                  deliberate, logged choice on your own account.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
                  {blocks.redTeamRejects ? (
                    <li>
                      <span className="font-semibold">Red-team REJECT</span>
                      {blocks.redTeamNotes ? ` — ${blocks.redTeamNotes}` : ""}
                    </li>
                  ) : null}
                  {blocks.railViolations.map((v) => (
                    <li key={v.rule}>
                      <span className="font-semibold">Rail · {v.rule}</span> —{" "}
                      {v.message}
                    </li>
                  ))}
                  {blocks.capViolations.map((v) => (
                    <li key={v.rule}>
                      <span className="font-semibold">Live cap · {v.rule}</span>{" "}
                      — {v.message}
                    </li>
                  ))}
                </ul>
                <label className="mt-3 block">
                  <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    Justification (required to override)
                  </span>
                  <textarea
                    value={overrideComment}
                    onChange={(e) => setOverrideComment(e.target.value)}
                    rows={3}
                    placeholder="Why are you overriding this safeguard? This is logged to the journal for your audit."
                    className="mt-1 w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </label>
                {!overrideReady ? (
                  <p className="mt-1 text-xs text-fg-muted">
                    Enter a justification to enable “Override &amp; approve”.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </AlertDialog>

      <ProposalDetailModal
        proposal={detailProposal}
        open={detailProposal !== null}
        onDismiss={() => setDetailId(null)}
      />
    </>
  );
}

/** A compact key-stat pill for the proposal's chip row (zone 3): a muted label
 *  + a tabular value. `gain`/`warning` tones flag the R:R against the 2:1 rail. */
function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "gain" | "warning";
}) {
  const valueCls =
    tone === "gain"
      ? "text-gain"
      : tone === "warning"
        ? "text-warning"
        : "text-fg";
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-pill border border-line bg-surface px-3 py-1">
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${valueCls}`}>
        {value}
      </span>
    </span>
  );
}
