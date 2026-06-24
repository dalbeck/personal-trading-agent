"use client";

import { useState } from "react";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/page-shell";
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

export function ProposalsList({ proposals }: { proposals: TradeProposal[] }) {
  // Local-only decisions — paper phase places no real orders, persists nothing.
  const [overrides, setOverrides] = useState<Record<string, Status>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const statusOf = (p: TradeProposal): Status => overrides[p.id] ?? p.status;

  function approve(id: string) {
    setOverrides((o) => ({ ...o, [id]: "approved" }));
    setConfirmId(null);
  }
  function reject(id: string) {
    setOverrides((o) => ({ ...o, [id]: "rejected" }));
  }

  const confirmProposal = proposals.find((p) => p.id === confirmId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-4">
        {proposals.map((p) => {
          const status = statusOf(p);
          const pending = status === "pending";
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
                <Badge tone={statusTone[status]} dot>
                  {status.toUpperCase()}
                </Badge>
              </div>

              <p className="mt-3 text-pretty text-sm text-fg">{p.thesis}</p>
              <p className="mt-2 text-pretty text-sm text-fg-muted">
                {p.reasoning}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-fg-muted">
                <span>Risk {formatPercent(p.riskPct, { signed: false })}</span>
                {p.stopPrice !== null ? (
                  <span>Stop {formatCurrency(p.stopPrice)}</span>
                ) : null}
                {p.takeProfit !== null ? (
                  <span>Target {formatCurrency(p.takeProfit)}</span>
                ) : null}
                {p.confidence !== null ? (
                  <span>
                    Confidence {Math.round(p.confidence * 100)}%
                  </span>
                ) : null}
              </div>

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
                      onClick={() => reject(p.id)}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmId(p.id)}
                    >
                      Approve
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-fg-muted">
                    {status === "approved"
                      ? "Approved (paper — no order placed)"
                      : "Rejected"}
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
            ? `Approve ${confirmProposal.action} ${confirmProposal.symbol}?`
            : "Approve proposal?"
        }
        description="This is a paper account. Approving records your decision locally for this session only — it places no real order and moves no money."
        confirmLabel="Approve (paper)"
        cancelLabel="Cancel"
        onConfirm={() => confirmProposal && approve(confirmProposal.id)}
        onDismiss={() => setConfirmId(null)}
      />
    </>
  );
}
