"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  /** Short question, used as the dialog's accessible name. */
  title: string;
  /** Plain-language details, e.g. which session this affects. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** True while the confirmed action is running: buttons are disabled. */
  pending?: boolean;
  /** Shown inside the dialog if the action failed. */
  error?: string | null;
};

/**
 * Accessible confirmation dialog built on the native <dialog> element opened with
 * showModal(): it is a real modal (the page behind is inert), labelled and
 * described for screen readers, Escape dismisses it, and focus returns to the
 * button that opened it. Tab is also trapped explicitly so focus never wanders
 * out to the browser's own controls. The safe "No" button gets focus first.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending = false,
  error = null,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // After a failure both buttons were disabled, so focus was lost: put it back
  // on the safe button so keyboard users can retry or back out.
  useEffect(() => {
    if (open && error && !pending) cancelRef.current?.focus();
  }, [open, error, pending]);

  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)"),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active !== null && focusable.includes(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={trapTab}
      // Keeps React state in sync if the browser closes the dialog itself
      // (Chrome closes on a repeated Escape even while we are busy).
      onClose={onCancel}
      onCancel={(event) => {
        // Escape. Let React state drive the close so it stays in sync.
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <div id={descriptionId} className="dialog-body">
        {children}
      </div>
      {error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : null}
      <div className="button-row">
        <button
          ref={cancelRef}
          type="button"
          className="button-secondary"
          onClick={onCancel}
          disabled={pending}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="button-danger"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? "Cancelling..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
