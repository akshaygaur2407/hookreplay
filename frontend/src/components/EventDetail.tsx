import { useState } from "react";
import type { HookEvent, ReplayResult } from "../lib/types";
import { formatBody, formatBytes, requestLine } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { MethodBadge } from "./MethodBadge";
import { ReplayPanel } from "./ReplayPanel";

type Tab = "body" | "headers" | "replay";

interface Props {
  slug: string;
  event: HookEvent;
  results: ReplayResult[];
  onResult: (eventId: number, result: ReplayResult) => void;
}

export function EventDetail({ slug, event, results, onResult }: Props) {
  const [tab, setTab] = useState<Tab>("body");
  const body = formatBody(event);

  const tabs: { id: Tab; label: string }[] = [
    { id: "body", label: "Body" },
    { id: "headers", label: `Headers (${event.headers.length})` },
    {
      id: "replay",
      label: results.length ? `Replay (${results.length})` : "Replay",
    },
  ];

  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-3">
        <MethodBadge method={event.method} />
        <h2 className="min-w-0 break-all font-mono text-base">
          {requestLine(event)}
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Received {new Date(event.received_at).toLocaleString()}
        {event.source_ip ? ` from ${event.source_ip}` : ""}, {" "}
        {event.body_size ? formatBytes(event.body_size) : "no body"}
        {event.content_type ? `, ${event.content_type}` : ""}
      </p>

      <div role="tablist" className="mt-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.id
                ? "border-signal text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "body" &&
          (event.body_size === 0 ? (
            <p className="text-sm text-muted">This request had no body.</p>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {body.isJson ? "JSON, formatted" : "Raw text"}
                </span>
                <CopyButton text={body.text} />
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-panel p-4 font-mono text-sm leading-relaxed">
                {body.text}
              </pre>
            </div>
          ))}

        {tab === "headers" && (
          <div className="overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full text-left font-mono text-xs">
              <tbody className="divide-y divide-line">
                {event.headers.map(([name, value], i) => (
                  <tr key={`${name}-${i}`} className="align-top">
                    <th className="w-1/3 px-4 py-2.5 font-medium text-muted">
                      {name}
                    </th>
                    <td className="break-all px-4 py-2.5">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
