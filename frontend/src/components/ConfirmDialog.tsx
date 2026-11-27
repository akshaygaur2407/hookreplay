import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "Confirm",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // Park focus on the (ring-less) body instead of a button. Otherwise
      // Cancel gets a focus ring, and that ring follows focus back to the
      // trigger button when the dialog closes.
      bodyRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault(); // Esc: let React state close it
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel(); // backdrop click
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl shadow-black/60 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div ref={bodyRef} tabIndex={-1} className="px-5 pb-4 pt-5 outline-none">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-bad/15 text-bad">
            <AlertTriangle size={18} />
          </span>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>

        {detail && (
          <code
            title={detail}
            className="mt-3 block truncate rounded-md bg-raised px-2.5 py-1.5 font-mono text-xs text-fg"
          >
            {detail}
          </code>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-line bg-raised/40 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-bad px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}