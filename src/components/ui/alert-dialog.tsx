"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./button";

/**
 * Confirmation dialog for irreversible/important actions (design-system + a11y
 * mandate). Built on the native <dialog> element via `showModal()`, so focus
 * trapping, Escape-to-close, and backdrop come for free and accessibly.
 */
const SIZE_CLASS = {
  md: "max-w-md",
  lg: "max-w-xl",
} as const;

export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  confirmDisabled = false,
  size = "md",
  onConfirm,
  onDismiss,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
  /** Dialog width. `lg` gives a roomy approve dialog (order + red-team + override). */
  size?: keyof typeof SIZE_CLASS;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Optional rich body rendered between the description and the actions. */
  children?: ReactNode;
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
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] ${SIZE_CLASS[size]} overflow-y-auto rounded-card border border-line bg-surface-overlay p-0 text-fg shadow-overlay backdrop:bg-black/50`}
    >
      <div className="p-6">
        <h2 id={titleId} className="text-base font-semibold text-balance">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-2 text-pretty text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={confirmDisabled}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
