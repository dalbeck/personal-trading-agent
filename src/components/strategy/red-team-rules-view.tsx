import { Fragment } from "react";
import { ScaleIcon } from "@/components/icons";
import { Term } from "@/components/term";
import { RED_TEAM_RULES } from "@/lib/red-team-rules";
import { tokenizeGlossary, type GlossaryKey } from "@/lib/glossary";

/**
 * Read-only render of the red-team prosecutor's ruleset (`RED_TEAM_RULES`) for
 * the Strategy page's "Red Team" tab. Presentation only — the rules and their
 * thresholds are code-derived (the page can't edit them), so this surfaces them
 * for the human to read alongside the editable Charter/Playbook.
 *
 * Jargon is auto-linked to a glossary tooltip (`<Term>`) on its FIRST appearance
 * across the whole view — a single `seen` set is threaded through every string,
 * tokenized server-side, so a term is tagged once (the component's restraint).
 */
export function RedTeamRulesView() {
  const seen = new Set<GlossaryKey>();
  const gloss = (text: string) =>
    tokenizeGlossary(text, seen).map((seg, i) =>
      typeof seg === "string" ? (
        <Fragment key={i}>{seg}</Fragment>
      ) : (
        <Term key={i} term={seg.term}>
          {seg.text}
        </Term>
      ),
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
        >
          <ScaleIcon className="size-[18px]" />
        </span>
        <p className="text-pretty text-sm leading-relaxed text-fg-muted">
          {gloss(RED_TEAM_RULES.intro)}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {RED_TEAM_RULES.sections.map((section) => (
          <section key={section.id}>
            <h3 className="font-serif text-[0.95rem] font-semibold text-fg">
              {section.title}
            </h3>
            <p className="mt-0.5 text-pretty text-sm text-fg-muted">
              {gloss(section.summary)}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {section.rules.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-fg">
                  <span
                    aria-hidden
                    className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent/60"
                  />
                  <span className="text-pretty leading-relaxed">
                    {gloss(rule)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div>
        <h3 className="font-serif text-[0.95rem] font-semibold text-fg">
          Thresholds
        </h3>
        <p className="mt-0.5 text-sm text-fg-muted">
          The numbers the prosecutor enforces — read live from the gate&rsquo;s
          constants.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {RED_TEAM_RULES.thresholds.map((t) => (
            <div
              key={t.label}
              className="rounded-input border border-line bg-surface p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm font-medium text-fg">{t.label}</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-accent">
                  {t.value}
                </dd>
              </div>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-fg-muted">
                {t.note}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
