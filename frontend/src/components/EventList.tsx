import type { HookEvent } from "../lib/types";
import { formatBytes, requestLine, timeAgo } from "../lib/format";
import { MethodBadge } from "./MethodBadge";

interface Props {
  events: HookEvent[];
  selectedId: number | null;
  now: number;
  onSelect: (id: number) => void;
}

export function EventList({ events, selectedId, now, onSelect }: Props) {
  return (
    <ul className="divide-y divide-line">
      {events.map((ev) => {
        const active = ev.id === selectedId;
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onSelect(ev.id)}
              aria-current={active}
              className={`block w-full border-l-2 px-4 py-3 text-left transition-colors ${
                active
                  ? "border-signal bg-raised"
                  : "border-transparent hover:bg-raised/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <MethodBadge method={ev.method} />
                <span className="truncate font-mono text-sm">
                  {requestLine(ev)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>{timeAgo(ev.received_at, now)}</span>
                <span>
                  {ev.body_size ? formatBytes(ev.body_size) : "No body"}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
