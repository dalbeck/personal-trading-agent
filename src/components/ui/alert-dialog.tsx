"use client";

import { useEffect, useId, useRef } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * Confirmation dialog for irreversible/important actions (design-system + a11y
 * mandate). Built on the native <dialog> element via `showModal()`, so focus
 * trapping, Escape-to-close, and backdrop come for free and accessibly.
 */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onDismiss,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

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
      aria-describedby={description ? descId : undefined}
      onClose={onDismiss}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-card border border-line bg-surface-overlay p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold text-balance">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-2 text-pretty text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
