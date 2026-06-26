"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { XIcon } from "@/components/icons";

/**
 * A formatted content modal for "Read more" detail (M5) — distinct from
 * `AlertDialog` (which is for confirm/cancel actions). Built on the native
 * <dialog> via `showModal()`, so focus-trapping, Esc-to-close, `aria-modal`,
 * and return-of-focus to the trigger come for free and accessibly. Adds
 * backdrop-click dismiss and a scrollable body. No animation — reduced-motion
 * safe by construction.
 */
export function Modal({
  open,
  title,
  onDismiss,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onDismiss: () => void;
  children?: ReactNode;
  /** Optional pinned action bar below the scrollable body (stays in view). */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onDismiss}
      // Backdrop click: the only target that is the <dialog> element itself is
      // the ::backdrop region; clicks on the inner content bubble from children.
      onClick={(e) => {
        if (e.target === ref.current) onDismiss();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-card border border-line bg-surface-overlay p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface-overlay px-6 py-4">
          <h2
            id={titleId}
            className="font-serif text-lg font-semibold text-balance"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-input text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-line bg-surface-overlay px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
