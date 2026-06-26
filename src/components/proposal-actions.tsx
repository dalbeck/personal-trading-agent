"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RedTeamRerunButton } from "@/components/red-team-rerun-button";
import { RedTeamVerdict } from "@/components/red-team-verdict";
import { Term } from "@/components/term";
import { formatCurrency, formatPercent } from "@/lib/format";
import { confidenceBucket } from "@/lib/confidence";
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { isAdvisoryProposal, type AdvisoryDecision } from "@/lib/proposal-advisory";
import type { TradeProposal } from "@/lib/types";

/**
 * The gated decision panel for one proposal, on the detail page (`/proposals/[id]`).
 * Extracted from the proposals list when the full-context modal became a page —
 * the approval/advisory flow is **unchanged**: a read-only precheck
 * (`/api/live/approve/precheck`) surfaces exactly what blocks the order, a typed
 * justification is required before "Override & approve", and a gate-closed
 * approval still routes to the dry-run sink. It also carries the page's
 * **Re-run red-team** + **Refresh research** actions. It places nothing the gates
 * don't allow; the order gate stays the real-money boundary.
 */

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

export function ProposalActions({
  proposal: p,
  liveEnabled,
}: {
  proposal: TradeProposal;
  liveEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [advResult, setAdvResult] = useState<AdvisoryDecision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [precheck, setPrecheck] = useState<{
    loading: boolean;
    result: PrecheckResult | null;
  }>({ loading: false, result: null });
  const [overrideComment, setOverrideComment] = useState("");

  const advisory = isAdvisoryProposal(p);
  const status = advResult ?? (result ? outcomeStatus(result) : p.status);
  const pending = status === "pending";

  async function decide(
    decision: "approve" | "deny",
    overrideCommentText?: string,
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/live/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: p.id,
          decision,
          ...(overrideCommentText && overrideCommentText.trim()
            ? { override: { comment: overrideCommentText.trim() } }
            : {}),
        }),
      });
      const data = (await res.json()) as DecisionResult & { error?: string };
      if (res.ok) {
        setResult(data);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  // Open the confirm dialog and run the read-only precheck so the 2-step override
  // can show exactly what (if anything) is blocking the order. Every state write
  // happens after an await — never synchronously in an effect.
  async function openConfirm() {
    setConfirming(true);
    setOverrideComment("");
    setPrecheck({ loading: true, result: null });
    try {
      const res = await fetch("/api/live/approve/precheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: p.id }),
      });
      const data = res.ok ? ((await res.json()) as PrecheckResult) : null;
      setPrecheck({ loading: false, result: data });
    } catch {
      setPrecheck({ loading: false, result: null });
    }
  }

  // Advisory proposals never touch the order path: record review/dismiss via the
  // status-only endpoint (no /api/live/approve).
  async function review(decision: AdvisoryDecision) {
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: p.id, decision }),
      });
      if (res.ok) {
        setAdvResult(decision);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function refreshResearch() {
    if (refreshing) return;
    setRefreshing(true);
    void (async () => {
      try {
        await fetch(
          `/api/symbol/${encodeURIComponent(p.symbol)}/research/refresh`,
          { method: "POST" },
        );
        router.refresh();
      } finally {
        setRefreshing(false);
      }
    })();
  }

  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  const conf = p.confidence === null ? null : confidenceBucket(p.confidence);
  const blocks = precheck.result;
  const blocked = blocks?.blocked ?? false;
  const overrideReady = overrideComment.trim().length > 0;
  const confirmBlocked = busy || precheck.loading || (blocked && !overrideReady);

  return (
    <div className="flex flex-col gap-3">
      {/* Terminal-state summary once acted on (or already decided). */}
      {!pending ? (
        <div className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
          {advisory ? (
            <span className="text-fg">
              {status === "reviewed" ? "Reviewed" : "Dismissed"} — advisory only;
              no order was placed by the desk.
            </span>
          ) : result ? (
            <span className="text-fg">
              {outcomeLabel[result.outcome]}
              {result.outcome === "approved" ? (
                <>
                  {" · routed to "}
                  <span className="font-medium">{result.destination}</span>
                  {result.dryRun ? " (dry-run sink)" : " (LIVE)"}
                  {result.brokerOrderId ? ` · ${result.brokerOrderId}` : ""}
                </>
              ) : null}
            </span>
          ) : (
            <span className="text-fg">
              {status === "approved" ? "Approved" : "Rejected"}
            </span>
          )}
        </div>
      ) : null}

      {/* The maintenance actions are always available (re-judge / re-fetch). */}
      <div className="flex flex-wrap items-center gap-2">
        <RedTeamRerunButton proposalId={p.id} />
        <Button
          variant="secondary"
          size="sm"
          disabled={refreshing}
          onClick={refreshResearch}
        >
          {refreshing ? "Refreshing research…" : "Refresh research"}
        </Button>

        {pending && advisory ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => review("dismissed")}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => review("reviewed")}
            >
              Mark reviewed
            </Button>
          </div>
        ) : pending ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => decide("deny")}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void openConfirm()}
            >
              Approve…
            </Button>
          </div>
        ) : null}
      </div>

      {advisory && pending ? (
        <p className="text-pretty text-xs text-fg-muted">
          Advisory only — no automated execution. Place this trade yourself in
          Robinhood if you agree.
        </p>
      ) : null}

      <AlertDialog
        open={confirming}
        size="lg"
        title={`Approve ${p.action.toUpperCase()} ${p.symbol}?`}
        description={
          liveEnabled
            ? "⚠ LIVE TRADING IS ON — approving places a REAL order with REAL money."
            : "Harness gate is closed. Approving routes this order to the dry-run sink (paper / mock broker) — no real money, never Robinhood."
        }
        confirmLabel={
          busy
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
        onConfirm={() => decide("approve", blocked ? overrideComment : undefined)}
        onDismiss={() => setConfirming(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-fg-muted">Ticker</dt>
              <dd className="text-right font-medium text-fg">{p.symbol}</dd>
              <dt className="text-fg-muted">Side / action</dt>
              <dd className="text-right tabular-nums text-fg">
                {p.action} · {p.side}
              </dd>
              <dt className="text-fg-muted">Quantity</dt>
              <dd className="text-right tabular-nums text-fg">{p.qty}</dd>
              <dt className="text-fg-muted">Order type</dt>
              <dd className="text-right text-fg">
                <Term term="marketable-limit">marketable-limit</Term>
              </dd>
              <dt className="text-fg-muted">Limit price</dt>
              <dd className="text-right tabular-nums text-fg">
                {formatCurrency(p.limitPrice)}
              </dd>
              <dt className="text-fg-muted">Est. cost</dt>
              <dd className="text-right tabular-nums text-fg">
                {formatCurrency(p.qty * p.limitPrice)}
              </dd>
              {p.stopPrice !== null ? (
                <>
                  <dt className="text-fg-muted">Stop</dt>
                  <dd className="text-right tabular-nums text-fg">
                    {formatCurrency(p.stopPrice)}
                  </dd>
                </>
              ) : null}
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-pretty text-sm text-fg">
              {p.thesis}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatChip label="Est. cost" value={formatCurrency(p.qty * p.limitPrice)} />
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

          {p.redTeam ? <RedTeamVerdict verdict={p.redTeam} /> : null}

          {precheck.loading ? (
            <p className="text-sm text-fg-muted">
              Checking the risk rails and red-team…
            </p>
          ) : blocked && blocks ? (
            <div className="rounded-card border border-danger-border bg-danger-surface p-4">
              <p className="text-sm font-semibold text-danger">
                This order is blocked by a safeguard. Overriding is a deliberate,
                logged choice on your own account.
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
                    <span className="font-semibold">Live cap · {v.rule}</span> —{" "}
                    {v.message}
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
      </AlertDialog>
    </div>
  );
}

function outcomeStatus(r: DecisionResult): TradeProposal["status"] {
  return r.outcome === "approved" ? "approved" : "rejected";
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
