"use client";

import { useState, useTransition } from "react";
import { saveStrategyDoc } from "@/app/strategy/actions";
import { Markdown } from "@/components/markdown";
import { RedTeamRulesView } from "@/components/strategy/red-team-rules-view";
import { Button } from "@/components/ui/button";

type Doc = { doc: string; title: string; content: string };

/** The read-only, code-derived Red Team rules tab — not a strategy doc, so it
 *  carries no Edit affordance and isn't written back to disk. */
const RED_TEAM_TAB = "red-team";

export function StrategyEditor({ docs }: { docs: Doc[] }) {
  const [contents, setContents] = useState<Record<string, string>>(() =>
    Object.fromEntries(docs.map((d) => [d.doc, d.content])),
  );
  const [active, setActive] = useState(docs[0]?.doc ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const isRedTeam = active === RED_TEAM_TAB;
  const current = contents[active] ?? "";
  const title = docs.find((d) => d.doc === active)?.title ?? active;
  const heading = isRedTeam ? "Red Team" : `${title}.md`;

  function startEdit() {
    setDraft(current);
    setEditing(true);
    setMessage(null);
  }

  function cancel() {
    setEditing(false);
    setMessage(null);
  }

  function save() {
    startTransition(async () => {
      const res = await saveStrategyDoc(active, draft);
      if (res.ok) {
        setContents((c) => ({ ...c, [active]: draft }));
        setEditing(false);
        setMessage({ tone: "ok", text: `Saved ${active}.md` });
      } else {
        setMessage({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Strategy documents"
        className="mb-4 inline-flex gap-1 rounded-pill border border-line bg-surface-raised p-1"
      >
        {docs.map((d) => {
          const isActive = d.doc === active;
          return (
            <button
              key={d.doc}
              role="tab"
              aria-selected={isActive}
              disabled={editing}
              onClick={() => {
                setActive(d.doc);
                setMessage(null);
              }}
              className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {d.title}
            </button>
          );
        })}
        <button
          role="tab"
          aria-selected={isRedTeam}
          disabled={editing}
          onClick={() => {
            setActive(RED_TEAM_TAB);
            setMessage(null);
          }}
          className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isRedTeam
              ? "bg-accent text-accent-foreground"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          Red Team
        </button>
      </div>

      <div className="rounded-card border border-line bg-surface-raised p-6">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4">
          <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
            {heading}
          </h2>
          {isRedTeam ? (
            <span className="rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-fg-muted">
              Read-only · from code
            </span>
          ) : editing ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              Edit
            </Button>
          )}
        </div>

        {message ? (
          <p
            role="status"
            className={`mb-3 text-sm ${
              message.tone === "ok" ? "text-gain" : "text-loss"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        {isRedTeam ? (
          <RedTeamRulesView />
        ) : editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            aria-label={`Edit ${title}.md`}
            className="h-[28rem] w-full resize-y rounded-input border border-line bg-surface p-4 font-mono text-sm leading-relaxed text-fg transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-raised"
          />
        ) : (
          <Markdown source={current} />
        )}
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        {isRedTeam ? (
          <>
            Read live from the prosecutor&rsquo;s logic in{" "}
            <code>src/lib/red-team-rules.ts</code> — edit the code, not this page.
          </>
        ) : (
          <>
            Edits write back to <code>strategy/{active}.md</code> in the repo.
          </>
        )}
      </p>
    </div>
  );
}
