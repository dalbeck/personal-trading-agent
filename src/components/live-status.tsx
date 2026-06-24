"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/alert-dialog";

/**
 * Header LIVE-TRADING status chip + one-click disconnect (M2). The chip
 * reflects the real two-gate state; ON is unmistakable (accent/gain), OFF is
 * muted. `reason` is surfaced on hover so the closed gate is always legible.
 *
 * The prop shape is declared locally on purpose — this is a client component
 * and must not import the `server-only` gate module (it would throw at build).
 */
export interface LiveStatusView {
  liveEnabled: boolean;
  disconnected: boolean;
  reason: string;
}

export function LiveStatusControl({ status }: { status: LiveStatusView }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/live/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const on = status.liveEnabled;

  return (
    <div className="flex items-center gap-2">
      <span
        title={status.reason}
        className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold ${
          on
            ? "border-gain/50 text-gain"
            : "border-line text-fg-muted font-medium"
        }`}
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-pill ${on ? "bg-gain" : "bg-fg-muted/50"}`}
        />
        {on ? "LIVE TRADING: ON" : "LIVE TRADING: OFF"}
      </span>

      {status.disconnected ? (
        <span
          title="Live trading is latched off. Clearing the halt is a deliberate human action."
          className="text-xs font-medium text-fg-muted"
        >
          disconnected
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Disconnect live trading"
          className="rounded-pill border border-loss/40 px-2.5 py-1 text-xs font-medium text-loss transition-colors duration-150 ease-out hover:bg-loss/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect
        </button>
      )}

      <AlertDialog
        open={confirming}
        title="Disconnect live trading?"
        description="Latches live trading OFF immediately. Even if both gates are open, no real-money order can be placed until a human clears the halt. This only ever makes the system safer."
        confirmLabel={busy ? "Disconnecting…" : "Disconnect"}
        confirmVariant="danger"
        onConfirm={disconnect}
        onDismiss={() => setConfirming(false)}
      />
    </div>
  );
}
