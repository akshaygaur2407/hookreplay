import { useState, type ReactNode } from "react";
import type { HookEvent, ReplayResult } from "../lib/types";
import { formatBody, formatBytes, requestLine, timeAgo } from "../lib/format";
import { useNow } from "../hooks/useNow";
import { detectProvider } from "../lib/signatures";
import { CopyButton } from "./CopyButton";
import { MethodBadge } from "./MethodBadge";
import { ReplayPanel } from "./ReplayPanel";
import { SignaturePanel } from "./SignaturePanel";

type Tab = "body" | "headers" | "signature" | "replay";

interface Props {
  slug: string;
  event: HookEvent;
  results: ReplayResult[];
  onResult: (eventId: number, result: ReplayResult) => void;
}

function Meta({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className="mt-1 truncate text-sm font-medium text-fg"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 truncate text-xs text-muted">{sub}</dd>}
    </div>
  );
}

export function EventDetail({ slug, event, results, onResult }: Props) {
  const [tab, setTab] = useState<Tab>("body");
  const now = useNow(30000);
  const body = formatBody(event);
  const signed = detectProvider(event.headers) !== null;

  const contentType = event.content_type?.split(";")[0].trim() || null;

  const tabs: { id: Tab; label: string; dot?: boolean }[] = [
    { id: "body", label: "Body" },
    { id: "headers", label: `Headers (${event.headers.length})` },
    { id: "signature", label: "Signature", dot: signed },
    {
      id: "replay",
      label: results.length ? `Replay (${results.length})` : "Replay",
    },
  ];

  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-3">
        <MethodBadge method={event.method} />
        <h2 className="min-w-0 break-all font-mono text-base text-fg">
          {requestLine(event)}
        </h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line bg-panel p-4 lg:grid-cols-4">
        <Meta
          label="Received"
          value={new Date(event.received_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "medium",
          })}
          sub={timeAgo(event.received_at, now)}
        />
        <Meta label="From" value={event.source_ip ?? "Unknown"} />
        <Meta
          label="Size"
          value={event.body_size ? formatBytes(event.body_size) : "No body"}
        />
        <Meta label="Type" value={contentType ?? "None"} />
      </dl>

      <div role="tablist" className="mt-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${tab === t.id
                ? "border-signal text-fg"
                : "border-transparent text-muted hover:text-fg"
              }`}
          >
            {t.label}
            {t.dot && (
              <span
                className="size-1.5 rounded-full bg-signal"
                title="Signature header detected"
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "body" &&
          (event.body_size === 0 ? (
            <p className="text-sm text-muted">This request had no body.</p>
          ) : (
            <div>
              {event.body_truncated && (
                <p className="mb-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  Showing the first 64 KB of {formatBytes(event.body_size)}. Signature checks and
                  replays always use the full body.
                </p>
              )}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {body.isJson ? "JSON, formatted" : "Raw text"}
                </span>
                <CopyButton text={body.text} />
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-panel p-4 font-mono text-sm leading-relaxed text-fg">
                {body.text}
              </pre>
            </div>
          ))}

        {tab === "headers" && (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full text-left font-mono text-xs">
              <tbody className="divide-y divide-line">
                {event.headers.map(([name, value], i) => (
                  // index in the key: the same header name can appear twice
                  <tr key={`${name}-${i}`} className="align-top">
                    <th className="w-1/3 px-4 py-2.5 font-medium text-muted">
                      {name}
                    </th>
                    <td className="break-all px-4 py-2.5 text-fg">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "signature" && <SignaturePanel slug={slug} event={event} />}

        {tab === "replay" && (
          <ReplayPanel
            slug={slug}
            event={event}
            results={results}
            onResult={onResult}
          />
        )}
      </div>
    </div>
  );
}