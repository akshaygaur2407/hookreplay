import { useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { replayEvent } from "../lib/api";
import { loadTarget, saveTarget } from "../lib/storage";
import type { HookEvent, ReplayResult } from "../lib/types";

interface Props {
  slug: string;
  event: HookEvent;
  results: ReplayResult[];
  onResult: (eventId: number, result: ReplayResult) => void;
}

function statusStyle(r: ReplayResult): string {
  if (r.status_code === null) return "bg-bad/15 text-bad";
  if (r.status_code < 300) return "bg-live/15 text-live";
  if (r.status_code < 500) return "bg-warn/15 text-warn";
  return "bg-bad/15 text-bad";
}

export function ReplayPanel({ slug, event, results, onResult }: Props) {
  const [target, setTarget] = useState(loadTarget);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    saveTarget(target);
    try {
      onResult(event.id, await replayEvent(slug, event.id, target));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong during replay."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={send}>
        <label htmlFor="target" className="text-sm font-medium">
          Send this request to
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="target"
            type="url"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="http://localhost:3000/webhook"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm placeholder:text-muted/60 focus:border-signal focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-60"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCw size={16} />
            )}
            Replay
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The backend sends the request, so a localhost target needs
          ALLOW_PRIVATE_TARGETS=true in the backend's environment.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </form>

      <section>
        <h3 className="text-sm font-medium">Replay history</h3>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing replayed yet. Results appear here as you send.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {results.map((r) => (
              <li
                key={r.replay_id}
                className="rounded-lg border border-line bg-panel p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-xs font-medium ${statusStyle(r)}`}
                  >
                    {r.status_code ?? "Failed"}
                  </span>
                  <span className="text-xs text-muted">{r.duration_ms} ms</span>
                  <span className="min-w-0 truncate font-mono text-xs text-muted">
                    {r.target_url}
                  </span>
                </div>
                {r.error && (
                  <p className="mt-2 break-words font-mono text-xs text-bad">
                    {r.error}
                  </p>
                )}
                {r.response_body && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg p-2.5 font-mono text-xs">
                    {r.response_body}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
