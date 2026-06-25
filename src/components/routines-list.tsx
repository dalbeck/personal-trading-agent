"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerRoutine } from "@/app/routines/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Card } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  routinePlacesOrders,
  type RoutineId,
  type RoutineRun,
  type RunStatus,
} from "@/lib/routines";

const statusMeta: Record<RunStatus, { label: string; dot: string; text: string }> =
  {
    ok: { label: "OK", dot: "bg-gain", text: "text-gain" },
    error: { label: "Error", dot: "bg-loss", text: "text-loss" },
    skipped: { label: "Skipped", dot: "bg-fg-muted/60", text: "text-fg-muted" },
    locked: { label: "Locked", dot: "bg-fg-muted/60", text: "text-fg-muted" },
    never: { label: "Never run", dot: "bg-fg-muted/40", text: "text-fg-muted" },
  };

export function RoutinesList({ routines }: { routines: RoutineRun[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startedId, setStartedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<RoutineId | null>(null);

  function run(id: RoutineId) {
    setBusyId(id);
    startTransition(async () => {
      const res = await triggerRoutine(id);
      setBusyId(null);
      setConfirmId(null);
      if (res.started) {
        setStartedId(id);
        // The run records its own RunLog when it finishes (a routine can take
        // minutes); refresh so the status updates once it lands.
        router.refresh();
      }
    });
  }

  function onRunClick(id: RoutineId) {
    if (routinePlacesOrders(id)) setConfirmId(id);
    else run(id);
  }

  const confirmRoutine = routines.find((r) => r.id === confirmId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {routines.map((r) => {
        const meta = statusMeta[r.lastStatus];
        const isBusy = busyId === r.id && pending;
        return (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2 rounded-pill ${meta.dot}`}
                  />
                  <h2 className="font-semibold text-fg">{r.name}</h2>
                </div>
                <p className="mt-1 text-pretty text-sm text-fg-muted">
                  {r.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
                  <span>{r.schedule}</span>
                  <span>
                    Last run:{" "}
                    {r.lastRun ? formatDateTime(r.lastRun) : "never"} ·{" "}
                    <span className={meta.text}>{meta.label}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => onRunClick(r.id)}
                >
                  {isBusy ? "Starting…" : "Run now"}
                </Button>
                {startedId === r.id ? (
                  <span role="status" className="max-w-56 text-pretty text-right text-xs text-fg-muted">
                    Started — running in the background (can take a minute).
                    Watch <span className="font-medium text-fg">Logs</span>; this
                    updates when it finishes.
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}

      <AlertDialog
        open={confirmRoutine !== null}
        title={
          confirmRoutine ? `Run ${confirmRoutine.name} now?` : "Run routine?"
        }
        description="This routine places PAPER orders (gated through the risk rails + red-team). No real money — the live order gate stays closed."
        confirmLabel={busyId ? "Starting…" : "Run now (paper)"}
        confirmDisabled={busyId !== null}
        onConfirm={() => confirmId && run(confirmId)}
        onDismiss={() => setConfirmId(null)}
      />
    </div>
  );
}
