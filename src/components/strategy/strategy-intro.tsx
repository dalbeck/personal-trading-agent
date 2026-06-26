import {
  StrategyIcon,
  GoLiveIcon,
  EvaluationIcon,
} from "@/components/icons";

/**
 * Small focal framing card for the Strategy page. Presentation only — it
 * restates the existing page intent (charter = immutable rule mirror,
 * playbook = decision checklist + lessons) as a composed two-up summary so
 * the page opens with a clear frame before the editor.
 */
export function StrategyIntro() {
  return (
    <div className="mb-5 rounded-card border border-line bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
        >
          <StrategyIcon className="size-[18px]" />
        </span>
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[10px] bg-fg/5 text-fg-muted"
            >
              <GoLiveIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Charter</p>
              <p className="mt-0.5 text-pretty text-sm text-fg-muted">
                The immutable rule mirror.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[10px] bg-fg/5 text-fg-muted"
            >
              <EvaluationIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">Playbook</p>
              <p className="mt-0.5 text-pretty text-sm text-fg-muted">
                The decision checklist and lessons.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
