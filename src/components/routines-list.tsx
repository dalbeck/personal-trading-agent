"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerRoutine } from "@/app/routines/actions";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Card } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ZapIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import {
  routinePlacesOrders,
  type RoutineId,
  type RoutineRun,
  type RunStatus,
} from "@/lib/routines";

const statusMeta: Record<
  RunStatus,
  { label: string; dot: string; text: string; tone: BadgeTone }
> = {
  ok: { label: "OK", dot: "bg-gain", text: "text-gain", tone: "gain" },
  error: { label: "Error", dot: "bg-loss", text: "text-loss", tone: "loss" },
  skipped: {
    label: "Skipped",
    dot: "bg-fg-muted/60",
    text: "text-fg-muted",
    tone: "muted",
  },
  locked: {
    label: "Locked",
    dot: "bg-fg-muted/60",
    text: "text-fg-muted",
    tone: "muted",
  },
  never: {
    label: "Never run",
    dot: "bg-fg-muted/40",
    text: "text-fg-muted",
    tone: "muted",
  },
};

// Needs-attention (errored) routines float to the top so a stalled job is the
// first thing you see; otherwise catalog order is preserved. Pure presentation
// ordering — does not touch any trigger/run logic.
const ATTENTION_RANK: Record<RunStatus, number> = {
  error: 0,
  never: 1,
  skipped: 2,
  locked: 2,
  ok: 3,
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

  // Surface needs-attention routines first (errored, then never-run), otherwise
  // keep catalog order. Stable sort preserves the original order within a tier.
  const ordered = routines
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        ATTENTION_RANK[a.r.lastStatus] - ATTENTION_RANK[b.r.lastStatus] ||
        a.i - b.i,
    )
    .map(({ r }) => r);

  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">
        {ordered.map((r) => {
          const meta = statusMeta[r.lastStatus];
          const isBusy = busyId === r.id && pending;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4 sm:px-5"
            >
              <div className="min-w-0 flex-1 basis-72">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-pill ${meta.dot}`}
                  />
                  <h2 className="truncate font-serif font-semibold text-fg">
                    {r.name}
                  </h2>
                  <Badge tone={meta.tone} solid>
                    {meta.label}
                  </Badge>
                </div>
                <p className="mt-1.5 text-pretty text-sm text-fg-muted">
                  {r.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                  <span>{r.schedule}</span>
                  <span aria-hidden className="text-fg-subtle">
                    ·
                  </span>
                  <span className="tabular-nums">
                    Last run {r.lastRun ? formatDateTime(r.lastRun) : "never"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => onRunClick(r.id)}
                >
                  <ZapIcon className="size-3.5" aria-hidden />
                  {isBusy ? "Starting…" : "Run now"}
                </Button>
                {startedId === r.id ? (
                  <span
                    role="status"
                    className="max-w-56 text-pretty text-right text-xs text-fg-muted"
                  >
                    Started — running in the background (can take a minute).
                    Watch <span className="font-medium text-fg">Logs</span>;
                    this updates when it finishes.
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

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
    </Card>
  );
}
