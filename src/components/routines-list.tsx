"use client";

import { useState } from "react";
import { Card } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { Routine, RunStatus } from "@/lib/routines";

const statusMeta: Record<RunStatus, { label: string; dot: string; text: string }> =
  {
    ok: { label: "OK", dot: "bg-gain", text: "text-gain" },
    error: { label: "Error", dot: "bg-loss", text: "text-loss" },
    skipped: { label: "Skipped", dot: "bg-fg-muted/60", text: "text-fg-muted" },
    never: { label: "Never run", dot: "bg-fg-muted/40", text: "text-fg-muted" },
  };

export function RoutinesList({ routines }: { routines: Routine[] }) {
  const [ran, setRan] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {routines.map((r) => {
        const meta = statusMeta[r.lastStatus];
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
                  onClick={() => setRan(r.id)}
                >
                  Run now
                </Button>
                {ran === r.id ? (
                  <span role="status" className="text-xs text-fg-muted">
                    Stubbed — runs via launchd in Phase 2.
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
