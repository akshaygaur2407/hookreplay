import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked; nothing useful to do */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-muted hover:text-fg"
    >
      {done ? <Check size={14} className="text-live" /> : <Copy size={14} />}
      {done ? "Copied" : label}
    </button>
  );
}
