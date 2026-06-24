import { Card, PageTitle } from "@/components/page-shell";

type Stat = {
  label: string;
  value: string;
  delta?: string;
  tone?: "gain" | "loss" | "neutral";
};

// Sample figures only — live paper/Alpaca data wiring lands in M2–M4.
const STATS: Stat[] = [
  { label: "Equity", value: "$104,812.55", tone: "neutral" },
  { label: "Total P&L", value: "+$4,812.55", delta: "+4.82%", tone: "gain" },
  { label: "Day P&L", value: "−$612.40", delta: "−0.58%", tone: "loss" },
  { label: "Buying power", value: "$38,240.00", tone: "neutral" },
];

const toneClass: Record<NonNullable<Stat["tone"]>, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-fg",
};

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Overview"
        subtitle="Paper account snapshot. This is the M1 shell — figures below are sample data."
      />

      <section
        aria-label="Account summary"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {STATS.map((s) => (
          <Card key={s.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {s.label}
            </p>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass[s.tone ?? "neutral"]}`}
            >
              {s.value}
            </p>
            {s.delta ? (
              <p
                className={`mt-1 text-sm tabular-nums ${toneClass[s.tone ?? "neutral"]}`}
              >
                {s.delta}
              </p>
            ) : null}
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-accent px-2 py-0.5 text-xs font-semibold text-fg">
              <span aria-hidden className="size-1.5 rounded-pill bg-accent" />
              PAPER
            </span>
            <h2 className="text-sm font-semibold text-fg">Paper account</h2>
          </div>
          <p className="text-pretty text-sm text-fg-muted">
            Connected to the Alpaca paper environment in a later milestone. All
            research and (paper) order proposals run here first.
          </p>
        </Card>

        <Card className="opacity-80">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2 py-0.5 text-xs font-medium text-fg-muted">
              <span
                aria-hidden
                className="size-1.5 rounded-pill bg-fg-muted/50"
              />
              LIVE
            </span>
            <h2 className="text-sm font-semibold text-fg-muted">
              Live account
            </h2>
          </div>
          <p className="text-pretty text-sm text-fg-muted">
            Not connected. Real-money execution is out of scope for Phase 1 and
            stays behind a two-gate human approval.
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-fg">Design system</h2>
          <p className="mb-4 text-pretty text-sm text-fg-muted">
            Button variants and semantic colors, toggled by theme.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors duration-150 ease-out hover:bg-accent-hover"
            >
              Primary
            </button>
            <button
              type="button"
              className="rounded-pill border border-line px-4 py-2 text-sm font-medium text-fg transition-colors duration-150 ease-out hover:bg-surface-overlay"
            >
              Secondary
            </button>
            <button
              type="button"
              className="rounded-pill px-4 py-2 text-sm font-medium text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
            >
              Ghost
            </button>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground opacity-50"
            >
              Disabled
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
