"use client";

import { useState, useTransition } from "react";
import { saveStrategyDoc } from "@/app/strategy/actions";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

type Doc = { doc: string; title: string; content: string };

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

  const current = contents[active] ?? "";
  const title = docs.find((d) => d.doc === active)?.title ?? active;

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
        className="mb-4 flex gap-1"
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
              className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                isActive
                  ? "bg-surface-overlay text-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {d.title}
            </button>
          );
        })}
      </div>

      <div className="rounded-card border border-line bg-surface-raised p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">{title}.md</h2>
          {editing ? (
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

        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            aria-label={`Edit ${title}.md`}
            className="h-[28rem] w-full resize-y rounded-card border border-line bg-surface p-3 font-mono text-sm leading-relaxed text-fg"
          />
        ) : (
          <Markdown source={current} />
        )}
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        Edits write back to <code>strategy/{active}.md</code> in the repo.
      </p>
    </div>
  );
}
