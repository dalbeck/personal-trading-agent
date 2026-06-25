import Link from "next/link";
import { Card, PageTitle } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import type { ReadinessState } from "@/lib/go-live";
import { getGoLiveReadiness } from "@/lib/server/go-live";

export const dynamic = "force-dynamic";

function StateMark({ state }: { state: ReadinessState }) {
  if (state === "done") {
    return (
      <span
        aria-hidden
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill bg-gain/15 text-xs font-bold text-gain"
      >
        ✓
      </span>
    );
  }
  if (state === "todo") {
    return (
      <span
        aria-hidden
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border border-line text-xs font-bold text-fg-muted"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill text-xs text-fg-muted"
    >
      ·
    </span>
  );
}

const stateLabel: Record<ReadinessState, string> = {
  done: "Done",
  todo: "To do",
  info: "Optional",
};

export default async function GoLivePage() {
  const { liveEnabled, reason, items } = await getGoLiveReadiness();
  const remaining = items.filter((i) => i.state === "todo").length;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Go-live readiness"
        subtitle="Everything between the shipped (gate-closed) state and human-approved live execution. Read-only — this page reports status and opens nothing; every step here is a deliberate human action."
      />

      <Card
        className={
          liveEnabled ? "border-gain/40 bg-gain/5" : "border-dashed"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={liveEnabled ? "gain" : "muted"} dot>
            {liveEnabled ? "LIVE TRADING: ON" : "LIVE TRADING: OFF"}
          </Badge>
          <span className="text-sm font-medium text-fg">
            {liveEnabled
              ? "Human-approved live execution is armed."
              : remaining === 1
                ? "1 step remaining."
                : `${remaining} steps remaining.`}
          </span>
        </div>
        <p className="mt-2 text-pretty text-sm text-fg-muted">
          {liveEnabled
            ? "Approving a live proposal now places a real Robinhood order. Every order still waits on your per-trade approval — the app never auto-trades."
            : reason}
        </p>
        <p className="mt-2 text-pretty text-xs text-fg-muted">
          The app never auto-trades; per-trade human approval is always required.
          Hands-off automation stays gated on the Phase 2 scorecard. Full
          procedure:{" "}
          <Link
            href="/strategy"
            className="font-medium text-fg underline-offset-2 hover:underline"
          >
            strategy &amp; charter
          </Link>
          .
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-fg">Checklist</h2>
        <ul className="flex flex-col">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 border-b border-line py-3 last:border-0"
            >
              <StateMark state={item.state} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{item.label}</span>
                  <span
                    className={`text-xs ${
                      item.state === "done"
                        ? "text-gain"
                        : item.state === "todo"
                          ? "text-fg-muted"
                          : "text-fg-muted"
                    }`}
                  >
                    {stateLabel[item.state]}
                  </span>
                </div>
                <p className="mt-0.5 text-pretty text-sm text-fg-muted">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
