"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Term } from "@/components/term";
import { formatPercent, formatQty } from "@/lib/format";
import {
  STAGED_ENTRY_DEFAULTS,
  nextPendingTranche,
  stagedPlanFilledQty,
  stagedPlanTotalQty,
  trancheConditionText,
} from "@/lib/staged-entry";
import type { StagedTranche, TradeProposal } from "@/lib/types";

const statusTone: Record<StagedTranche["status"], BadgeTone> = {
  pending: "muted",
  filled: "gain",
  skipped: "loss",
};

/**
 * Staged-entry (DCA / scale-in) plan card on the proposal detail page
 * (staged-entry-plan M2). Shows the tranche schedule (size, timing, condition,
 * status) and makes plain that **risk is sized on the full position** and that
 * **each tranche is a separate gated approval** — no auto-execution. When no plan
 * exists it offers to add one with the documented defaults; the human can remove
 * it any time.
 *
 * The actual per-tranche approval runs through the normal gated approve flow in
 * {@link ProposalActions} (the Decision panel approves the next pending tranche).
 */
export function StagedEntryPlanCard({ proposal: p }: { proposal: TradeProposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const plan = p.stagedPlan;

  async function mutate(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/proposals/${encodeURIComponent(p.id)}/staged-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-pretty text-sm leading-relaxed text-fg-muted">
          Optionally scale into this position with a{" "}
          <Term term="staged-entry">staged-entry (DCA) plan</Term> — split the
          full {formatQty(p.qty)}-share position into tranches you approve one at a
          time. Risk stays sized on the <em>full</em> position; nothing
          auto-executes.
        </p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void mutate({
                trancheCount: STAGED_ENTRY_DEFAULTS.trancheCount,
                intervalDays: STAGED_ENTRY_DEFAULTS.intervalDays,
                driftBandPct: STAGED_ENTRY_DEFAULTS.driftBandPct,
              })
            }
          >
            {busy ? "Adding…" : "Add staged-entry plan"}
          </Button>
        </div>
      </div>
    );
  }

  const total = stagedPlanTotalQty(plan);
  const filled = stagedPlanFilledQty(plan);
  const next = nextPendingTranche(plan);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-pretty text-sm leading-relaxed text-fg-muted">
        The full {formatQty(total)}-share position, split into {plan.trancheCount}{" "}
        tranches ~{plan.intervalDays} days apart (add within ±
        {Math.round(plan.driftBandPct * 100)}% of the prior fill).{" "}
        <span className="text-fg">{formatQty(filled)} filled</span> so far. Risk is
        sized on the full position — the ≤2% rail binds the completed position, so
        finishing every tranche is never over-risked.
      </p>

      <div className="overflow-hidden rounded-input border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs text-fg-muted">
              <th className="px-3 py-2 font-medium">Tranche</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">When &amp; condition</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.tranches.map((t) => {
              const isNext = next?.index === t.index;
              return (
                <tr
                  key={t.index}
                  className={`border-b border-line last:border-0 ${
                    isNext ? "bg-accent/5" : ""
                  }`}
                >
                  <td className="px-3 py-2 tabular-nums text-fg">
                    {t.index + 1} / {plan.tranches.length}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-fg">
                    {formatQty(t.qty)} sh
                    <span className="text-fg-muted">
                      {" "}
                      ({formatPercent(t.fraction, { signed: false })})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-pretty text-fg-muted">
                    {trancheConditionText(plan, t)}
                    {isNext ? (
                      <span className="ml-1 font-medium text-fg">· next</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge tone={statusTone[t.status]} dot>
                      {t.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">
        DCA reduces <em>timing</em> risk, not market risk — averaging into a
        decliner can average into a loss. The schedule is a suggestion; you
        approve each tranche through the normal gated approval when it&apos;s due.
      </p>

      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void mutate({ remove: true })}
        >
          {busy ? "Removing…" : "Remove plan"}
        </Button>
      </div>
    </div>
  );
}
