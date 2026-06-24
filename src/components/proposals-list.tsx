"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/page-shell";
import { RiskRewardBar } from "@/components/risk-reward-bar";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { TradeProposal } from "@/lib/types";

type Status = TradeProposal["status"];

const statusTone: Record<Status, BadgeTone> = {
  pending: "accent",
  approved: "gain",
  rejected: "loss",
};

const redTeamTone: Record<string, BadgeTone> = {
  approve: "gain",
  concern: "neutral",
  reject: "loss",
};

interface DecisionResult {
  outcome: "approved" | "denied" | "blocked-risk" | "blocked-redteam";
  destination?: "robinhood" | "alpaca-paper" | "mock";
  brokerOrderId?: string;
  dryRun: boolean;
}

const outcomeLabel: Record<DecisionResult["outcome"], string> = {
  approved: "Approved",
  denied: "Denied (journaled)",
  "blocked-risk": "Blocked by risk rails",
  "blocked-redteam": "Blocked by red-team",
};

export function ProposalsList({
  proposals,
  liveEnabled,
}: {
  proposals: TradeProposal[];
  liveEnabled: boolean;
}) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, DecisionResult>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusOf = (p: TradeProposal): Status => {
    const r = results[p.id];
    if (!r) return p.status;
    return r.outcome === "approved" ? "approved" : "rejected";
  };

  async function decide(id: string, decision: "approve" | "deny") {
    setBusyId(id);
    try {
      const res = await fetch("/api/live/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: id, decision }),
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

  const confirmProposal = proposals.find((p) => p.id === confirmId) ?? null;
  const redTeamRejected =
    confirmProposal?.redTeam?.verdict === "reject";

  return (
    <>
      <div className="flex flex-col gap-4">
        {proposals.map((p) => {
          const status = statusOf(p);
          const pending = status === "pending";
          const result = results[p.id];
          const estCost = p.qty * p.limitPrice;
          return (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={p.action === "buy" ? "gain" : "loss"}>
                    {p.action.toUpperCase()}
                  </Badge>
                  <span className="font-semibold text-fg">{p.symbol}</span>
                  <span className="text-sm tabular-nums text-fg-muted">
                    {p.qty} @ {formatCurrency(p.limitPrice)} limit
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.sample ? <SampleDataBadge /> : null}
                  <Badge tone={statusTone[status]} dot>
                    {status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <p className="mt-3 text-pretty text-sm text-fg">{p.thesis}</p>
              <p className="mt-2 text-pretty text-sm text-fg-muted">
                {p.reasoning}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
                <span className="text-fg-muted">
                  Est. cost{" "}
                  <span className="font-semibold text-fg">
                    {formatCurrency(estCost)}
                  </span>
                </span>
                <span className="text-fg-muted">
                  Risk{" "}
                  <span className="font-semibold text-fg">
                    {formatPercent(p.riskPct, { signed: false })}
                  </span>
                </span>
              </div>

              <RiskRewardBar
                action={p.action}
                entry={p.limitPrice}
                stop={p.stopPrice}
                target={p.takeProfit}
                confidence={p.confidence}
              />

              {p.redTeam ? (
                <div className="mt-3 rounded-card border border-line bg-surface-overlay p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      Codex red-team
                    </span>
                    <Badge tone={redTeamTone[p.redTeam.verdict]}>
                      {p.redTeam.verdict}
                    </Badge>
                  </div>
                  <p className="text-pretty text-sm text-fg-muted">
                    {p.redTeam.notes}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-4">
                {pending ? (
                  <>
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
                      onClick={() => setConfirmId(p.id)}
                    >
                      Approve…
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-fg-muted">
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
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={confirmProposal !== null}
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
            : liveEnabled
              ? "Approve — place LIVE order"
              : "Approve (dry-run)"
        }
        confirmVariant={liveEnabled ? "danger" : "primary"}
        confirmDisabled={redTeamRejected || busyId !== null}
        onConfirm={() => confirmProposal && decide(confirmProposal.id, "approve")}
        onDismiss={() => setConfirmId(null)}
      >
        {confirmProposal ? (
          <div className="rounded-card border border-line bg-surface p-3">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
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
              <dd className="text-right text-fg">marketable-limit</dd>
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

            {confirmProposal.redTeam ? (
              <div className="mt-3 flex items-start gap-2 text-xs">
                <Badge tone={redTeamTone[confirmProposal.redTeam.verdict]}>
                  red-team: {confirmProposal.redTeam.verdict}
                </Badge>
                <span className="text-pretty text-fg-muted">
                  {confirmProposal.redTeam.notes}
                </span>
              </div>
            ) : null}

            {redTeamRejected ? (
              <p className="mt-3 text-xs font-medium text-loss">
                Red-team rejected this trade — it cannot be approved.
              </p>
            ) : null}
          </div>
        ) : null}
      </AlertDialog>
    </>
  );
}
