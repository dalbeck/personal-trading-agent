"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/alert-dialog";
import {
  OPS_ACTIONS,
  OPS_GROUP_ORDER,
  type OpsActionMeta,
} from "@/lib/ops";

type StreamEvent =
  | { type: "start"; action: string; label: string; steps: number }
  | { type: "chunk"; text: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string };

export function OpsPanel({ enabled }: { enabled: boolean }) {
  const [running, setRunning] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OpsActionMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(action: OpsActionMeta) {
    if (running) return;
    setRunning(action.id);
    setActiveLabel(action.label);
    setOutput("");
    setExitCode(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Same-origin POST: the browser sets Sec-Fetch-Site: same-origin, which is
      // the endpoint's browser credential (no token in the page).
      const res = await fetch(`/api/ops/${encodeURIComponent(action.id)}`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* non-JSON error */
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
          if (evt.type === "chunk") setOutput((o) => o + evt.text);
          else if (evt.type === "exit") setExitCode(evt.code);
          else if (evt.type === "error") setError(evt.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(null);
      abortRef.current = null;
    }
  }

  function onClick(action: OpsActionMeta) {
    if (action.confirm) setPending(action);
    else void run(action);
  }

  function stop() {
    abortRef.current?.abort();
  }

  const busy = running !== null;
  const statusTone =
    exitCode === null ? "neutral" : exitCode === 0 ? "gain" : "loss";

  return (
    <div className="flex flex-col gap-4">
      {!enabled ? (
        <Card className="border-dashed">
          <div className="flex items-center gap-2">
            <Badge tone="loss" dot>
              DISABLED
            </Badge>
            <span className="text-sm font-medium text-fg">
              Operations runner is off
            </span>
          </div>
          <p className="mt-2 text-pretty text-sm text-fg-muted">
            Set <code>ROUTINE_TRIGGER_TOKEN</code> in <code>.env</code> (e.g.{" "}
            <code>openssl rand -hex 32</code>) and restart the dashboard server
            to enable running scripts from here. The endpoint fails closed
            without it.
          </p>
        </Card>
      ) : null}

      {OPS_GROUP_ORDER.map((group) => {
        const actions = OPS_ACTIONS.filter((a) => a.group === group);
        if (actions.length === 0) return null;
        const emergency = group === "Emergency";
        return (
          <Card
            key={group}
            className={emergency ? "border-loss/40" : undefined}
          >
            <h2 className="text-sm font-semibold tracking-tight text-fg">
              {group}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className="flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {action.label}
                    </p>
                    <p className="mt-0.5 text-pretty text-xs text-fg-muted">
                      {action.description}
                    </p>
                  </div>
                  <Button
                    variant={action.danger ? "danger" : "secondary"}
                    size="sm"
                    disabled={!enabled || busy}
                    onClick={() => onClick(action)}
                    aria-label={`Run ${action.label}`}
                  >
                    {running === action.id ? "Running…" : "Run"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Output console */}
      {activeLabel ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-fg">{activeLabel}</span>
              {busy ? (
                <Badge tone="neutral" dot>
                  RUNNING
                </Badge>
              ) : exitCode !== null ? (
                <Badge tone={statusTone} dot>
                  {exitCode === 0 ? "EXIT 0" : `EXIT ${exitCode}`}
                </Badge>
              ) : null}
            </div>
            {busy ? (
              <Button variant="ghost" size="sm" onClick={stop}>
                Stop
              </Button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mb-2 text-sm text-loss">
              {error}
            </p>
          ) : null}

          <pre
            aria-live="polite"
            aria-label="Command output"
            className="max-h-96 overflow-auto rounded-card border border-line bg-surface p-3 text-xs leading-relaxed text-fg-muted whitespace-pre-wrap tabular-nums"
          >
            {output || (busy ? "Starting…" : "No output.")}
          </pre>
        </Card>
      ) : null}

      <AlertDialog
        open={pending !== null}
        title={pending?.confirm?.title ?? "Confirm"}
        description={pending?.confirm?.body}
        confirmLabel={pending?.confirm?.confirmLabel ?? "Run"}
        confirmVariant={pending?.danger ? "danger" : "primary"}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          if (action) void run(action);
        }}
        onDismiss={() => setPending(null)}
      />
    </div>
  );
}
