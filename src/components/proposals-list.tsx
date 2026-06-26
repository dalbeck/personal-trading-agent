"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProposalDetailModal } from "@/components/proposal-detail-modal";
import { RedTeamRerunButton } from "@/components/red-team-rerun-button";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { Term } from "@/components/term";
import { ChevronRightIcon } from "@/components/icons";
import { formatCurrency, formatPercent } from "@/lib/format";
import { confidenceBucket } from "@/lib/confidence";
import { CONVICTION_TIERS, compareByConviction } from "@/lib/conviction";
import { convictionTierStyle } from "@/lib/conviction-style";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { redTeamVerdictStyle } from "@/lib/red-team-style";
import { groupProposalsByDay } from "@/lib/proposal-grouping";
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

  // Optional conviction filter (M1) — a **view** preference, default "all" so
  // nothing is hidden by default. Raising it removes only proposals explicitly
  // tiered below the threshold; untiered (unscored / legacy / manual) proposals
  // always stay visible — the filter never silently drops something it didn't
  // rank low. The persisted default lives in the discovery settings (M3).
  const [tierFilter, setTierFilter] = useState<"all" | "moderate" | "high">(
    "all",
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
  // Within each day, sort high-conviction first (sorting, not hiding — all tiers
  // render). Day order itself stays newest-first.
  const groups = useMemo(
    () =>
      groupProposalsByDay(visible, nowMs).map((g) => ({
        ...g,
        items: [...g.items].sort(compareByConviction),
      })),
    [visible, nowMs],
  );

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

  // The decisions live on the full-context modal now that the list is a slim
  // table (M8). Built here so all the approval/advisory logic stays in one
  // place; "Approve…" hands off to the existing confirm + precheck dialog.
  function actionsFor(p: TradeProposal): ReactNode {
    const status = statusOf(p);
    const pending = status === "pending";
    const advisory = isAdvisoryProposal(p);
    const result = results[p.id];

    if (!pending) {
      return (
        <p className="text-right text-xs text-fg-muted">
          {advisory ? (
            (advisoryStatusLabel[status] ?? status)
          ) : result ? (
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
                  {result.brokerOrderId ? <> · {result.brokerOrderId}</> : null}
                </>
              ) : null}
            </>
          ) : status === "approved" ? (
            "Approved"
          ) : (
            "Rejected"
          )}
        </p>
      );
    }

    if (advisory) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-pretty text-xs text-fg-muted">
            Advisory only — no automated execution. Place this trade yourself in
            Robinhood if you agree.
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
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
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
          onClick={() => {
            // Hand off to the confirm + precheck dialog; the slim modal closes
            // so the two dialogs never stack.
            setDetailId(null);
            void openConfirm(p.id);
          }}
        >
          Approve…
        </Button>
      </div>
    );
  }

  return (
    <>
      {hasTiers ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-muted">
            Sorted by conviction · all tiers shown
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
                <ProposalRow
                  key={p.id}
                  proposal={p}
                  status={statusOf(p)}
                  onOpen={() => setDetailId(p.id)}
                />
              ))}
            </div>
          </section>
        ))}
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
        actions={detailProposal ? actionsFor(detailProposal) : undefined}
      />
    </>
  );
}

/**
 * A slim, scannable proposal row (M8) — a real <button> that opens the
 * full-context modal. A primary line (side pill · serif ticker · tags ·
 * status · chevron) over a muted meta line (sector · R:R · red-team verdict ·
 * confidence), so the feed stays dense yet readable at any width.
 */
function ProposalRow({
  proposal: p,
  status,
  onOpen,
}: {
  proposal: TradeProposal;
  status: Status;
  onOpen: () => void;
}) {
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

  return (
    <button
      type="button"
      onClick={onOpen}
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
        {p.convictionTier ? (
          <Badge tone={convictionTierStyle[p.convictionTier].tone}>
            {convictionTierStyle[p.convictionTier].label}
          </Badge>
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
          <Badge tone={statusTone[status]} dot>
            {status.toUpperCase()}
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

/** A compact key-stat pill for the approve dialog: a muted label + a tabular
 *  value. `gain`/`warning` tones flag the R:R against the 2:1 rail. */
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
