"use client";

import { useState, useTransition } from "react";
import { saveStrategyDoc } from "@/app/strategy/actions";
import { Markdown } from "@/components/markdown";
import { RedTeamRulesView } from "@/components/strategy/red-team-rules-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HORIZON_LABEL, SLEEVE_LABEL } from "@/lib/sleeves";
import type { Horizon, Sleeve } from "@/lib/sleeves";

type DocSleeveMeta = { ids: Sleeve[]; horizon: Horizon; enabled: boolean };
type Doc = {
  doc: string;
  title: string;
  group: "Charters" | "Playbook";
  sleeve: DocSleeveMeta | null;
  content: string;
};

/** The read-only, code-derived Red Team rules tab — not a strategy doc, so it
 *  carries no Edit affordance and isn't written back to disk. */
const RED_TEAM_TAB = "red-team";

/** Sleeve routing chips for a charter row — horizon, enabled/disabled, and the
 *  sleeve id(s) the file governs — so the page shows at a glance which investment
 *  types exist and which are live. */
function SleeveMetaChips({ sleeve }: { sleeve: DocSleeveMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="muted">{HORIZON_LABEL[sleeve.horizon]}</Badge>
      <Badge tone={sleeve.enabled ? "gain" : "neutral"}>
        {sleeve.enabled ? "Live" : "Disabled"}
      </Badge>
      {sleeve.ids.map((id) => (
        <span
          key={id}
          className="rounded-pill border border-line px-2 py-0.5 font-mono text-[0.7rem] text-fg-muted"
          title={SLEEVE_LABEL[id]}
        >
          {id}
        </span>
      ))}
    </div>
  );
}

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
  const activeDoc = docs.find((d) => d.doc === active) ?? null;
  const current = contents[active] ?? "";
  const title = activeDoc?.title ?? active;
  const heading = isRedTeam ? "Red Team" : `${title}`;

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

  function tabButton(
    key: string,
    label: string,
    selected: boolean,
    onSelect: () => void,
    dimmed = false,
  ) {
    return (
      <button
        key={key}
        role="tab"
        aria-selected={selected}
        disabled={editing}
        onClick={onSelect}
        className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          selected
            ? "bg-accent text-accent-foreground"
            : `hover:text-fg ${dimmed ? "text-fg-subtle" : "text-fg-muted"}`
        }`}
      >
        {label}
      </button>
    );
  }

  const charters = docs.filter((d) => d.group === "Charters");
  const playbooks = docs.filter((d) => d.group === "Playbook");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Strategy documents"
        className="mb-4 flex flex-wrap items-center gap-1 rounded-card border border-line bg-surface-raised p-1"
      >
        {charters.map((d) =>
          tabButton(
            d.doc,
            d.title,
            d.doc === active,
            () => {
              setActive(d.doc);
              setMessage(null);
            },
            d.sleeve ? !d.sleeve.enabled : false,
          ),
        )}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        {playbooks.map((d) =>
          tabButton(d.doc, d.title, d.doc === active, () => {
            setActive(d.doc);
            setMessage(null);
          }),
        )}
        {tabButton("Red Team", "Red Team", isRedTeam, () => {
          setActive(RED_TEAM_TAB);
          setMessage(null);
        })}
      </div>

      <div className="rounded-card border border-line bg-surface-raised p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
              {heading}
            </h2>
            {activeDoc?.sleeve ? (
              <SleeveMetaChips sleeve={activeDoc.sleeve} />
            ) : null}
          </div>
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
            aria-label={`Edit ${title}`}
            className="h-[28rem] w-full resize-y rounded-input border border-line bg-surface p-4 font-mono text-sm leading-relaxed text-fg transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-raised"
          />
        ) : current ? (
          <Markdown source={current} />
        ) : (
          <p className="text-sm text-fg-muted">
            This charter is declared in the sleeve registry but its mandate
            hasn&rsquo;t been written yet — it fills in when its sleeve ships.
          </p>
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
            Charters are human-owned constitution — the agent never writes them.
          </>
        )}
      </p>
    </div>
  );
}
