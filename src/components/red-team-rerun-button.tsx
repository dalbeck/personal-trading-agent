"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_RED_TEAM_MODEL,
  RED_TEAM_MODEL_FULL_LABEL,
  type RedTeamModel,
} from "@/lib/red-team-model";

/**
 * Confirm-gated "Re-run red-team" for one proposal. The prosecutor verdict is
 * otherwise cached permanently on the proposal (the discovery sweep skips judged
 * proposals), so this is the deliberate way to re-judge after editing a thesis.
 *
 * The model picker (red-team-model-toggle) chooses which prosecutor re-judges —
 * GPT (default) or Claude Opus — which is how you A/B the SAME proposal under
 * both judges and compare. It **re-spends one prosecutor call**, hence the
 * confirm. On success it refreshes the route so the overwritten verdict (now
 * stamped with the model that produced it) renders.
 */
export function RedTeamRerunButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<RedTeamModel>(DEFAULT_RED_TEAM_MODEL);

  async function rerun() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/red-team`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model }),
        },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`red-team-model-${proposalId}`}>
          Red-team prosecutor model
        </label>
        <select
          id={`red-team-model-${proposalId}`}
          value={model}
          onChange={(e) => setModel(e.target.value as RedTeamModel)}
          disabled={busy}
          className="rounded-input border border-line bg-surface px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="codex">{RED_TEAM_MODEL_FULL_LABEL.codex}</option>
          <option value="claude">{RED_TEAM_MODEL_FULL_LABEL.claude}</option>
        </select>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {busy ? "Re-running…" : "Re-run red-team"}
        </Button>
      </div>

      <AlertDialog
        open={confirming}
        title="Re-run the red-team prosecutor?"
        description={`This re-judges the proposal with a fresh ${RED_TEAM_MODEL_FULL_LABEL[model]} prosecutor call and overwrites the stored verdict. It places nothing.`}
        confirmLabel={busy ? "Re-running…" : "Re-run red-team"}
        confirmVariant="primary"
        confirmDisabled={busy}
        onConfirm={rerun}
        onDismiss={() => setConfirming(false)}
      />
    </>
  );
}
