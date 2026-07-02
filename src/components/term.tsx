"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { InfoIcon } from "@/components/icons";
import {
  GLOSSARY,
  tokenizeGlossary,
  type GlossaryEntry,
  type GlossaryKey,
} from "@/lib/glossary";

/**
 * Inline glossary term — a subtle dotted-underline trigger with a small info
 * dot that reveals a plain-language definition (and an optional caveat) from the
 * central glossary. Opens on hover, focus, AND tap; dismisses on Esc, blur, or
 * an outside tap. The trigger is a real button (keyboard-focusable, carries
 * `aria-expanded`); the popover is `role="tooltip"` linked via `aria-describedby`.
 * No motion, so `prefers-reduced-motion` is respected by construction.
 *
 * Restraint: tag a term only on its **primary** appearance per view, and only
 * genuinely jargony terms — never decorate every word.
 */
export function Term({
  term,
  children,
}: {
  term: GlossaryKey;
  /** Override the displayed text; defaults to the glossary label. */
  children?: ReactNode;
}) {
  const entry: GlossaryEntry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onOutside(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 rounded-[3px] underline decoration-dotted decoration-fg-muted/60 underline-offset-2 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children ?? entry.label}
        <InfoIcon className="size-3 shrink-0 text-fg-muted" />
      </button>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className="absolute left-0 top-full z-30 mt-1.5 block w-64 rounded-card border border-line bg-surface-overlay p-3 text-left font-normal normal-case tracking-normal shadow-overlay"
        >
          <span className="block text-xs font-semibold text-fg">
            {entry.label}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
            {entry.definition}
          </span>
          {entry.caveat ? (
            <span className="mt-1.5 block text-xs leading-relaxed text-warning">
              {entry.caveat}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Render free-flowing copy with its jargon auto-linked to glossary tooltips: the
 * first occurrence of each known term (across the shared `seen` set) becomes a
 * `<Term>`; everything else stays plain text. Pass ONE `seen` set down a view so
 * a term is tagged only on its primary appearance (the restraint above).
 */
export function GlossaryText({
  text,
  seen,
}: {
  text: string;
  seen?: Set<GlossaryKey>;
}) {
  const segments = tokenizeGlossary(text, seen);
  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === "string" ? (
          <Fragment key={i}>{seg}</Fragment>
        ) : (
          <Term key={i} term={seg.term}>
            {seg.text}
          </Term>
        ),
      )}
    </>
  );
}
