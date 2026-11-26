
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl border border-line bg-panel p-0 text-fg shadow-2xl shadow-black/50 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        {/* Header and description */}
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bad/15 text-bad">
            <AlertTriangle size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6">
              {title}
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted">
              {description}
            </p>
          </div>
        </div>

        {/* Additional detail */}
        {detail && (
          <div className="mt-5 rounded-lg bg-raised px-3 py-3">
            <code className="block break-all font-mono text-xs leading-5 text-fg">
              {detail}
            </code>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p role="alert" className="mt-4 text-sm leading-5 text-bad">
            {error}
          </p>
        )}

        {/* Footer actions */}
        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-bad px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
