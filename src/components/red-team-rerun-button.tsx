"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirm-gated "Re-run red-team" for one proposal. The prosecutor verdict is
 * otherwise cached permanently on the proposal (the discovery sweep skips judged
 * proposals), so this is the deliberate way to re-judge after editing a thesis.
 * It **re-spends one ~10s codex call**, hence the confirm. On success it
 * refreshes the route so the overwritten verdict renders.
 */
export function RedTeamRerunButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rerun() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/red-team`,
        { method: "POST" },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {busy ? "Re-running…" : "Re-run red-team"}
      </Button>

      <AlertDialog
        open={confirming}
        title="Re-run the red-team prosecutor?"
        description="This re-judges the proposal with a fresh cross-model prosecutor call (~10s) and overwrites the stored verdict. It places nothing."
        confirmLabel={busy ? "Re-running…" : "Re-run red-team"}
        confirmVariant="primary"
        confirmDisabled={busy}
        onConfirm={rerun}
        onDismiss={() => setConfirming(false)}
      />
    </>
  );
}
