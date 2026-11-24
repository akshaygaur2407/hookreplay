import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  Webhook,
} from "lucide-react";

import { CopyButton } from "../components/CopyButton";
import { EventDetail } from "../components/EventDetail";
import { EventList } from "../components/EventList";
import { Logo } from "../components/Logo";
import { useEvents } from "../hooks/useEvents";
import { useNow } from "../hooks/useNow";
import { API, createEndpoint } from "../lib/api";
import { expiry } from "../lib/format";
import { loadEndpoints, saveEndpoints } from "../lib/storage";
import type { Endpoint, ReplayResult } from "../lib/types";
import { useAuth } from "../hooks/useAuth";
/* ---------- empty states ---------- */

function NoEndpoint({
  onCreate,
  creating,
  error,
}: {
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}) {
  return (
    <div className="grid h-full place-items-center px-6 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-raised text-signal">
          <Webhook size={24} />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">
          Create your first capture URL
        </h2>
        <p className="mt-2 text-muted">
          You get an address to give Stripe, GitHub, or any other service.
          Every request it receives shows up here as it arrives.
        </p>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-60"
        >
          {creating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Create endpoint
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function WaitingForRequests({ url }: { url: string }) {
  const sample = `curl -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -d '{"hello": "world"}'`;
  return (
    <div className="grid h-full place-items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <span className="grid size-12 place-items-center rounded-xl bg-raised text-muted">
          <Inbox size={24} />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">
          Waiting for the first request
        </h2>
        <p className="mt-2 text-muted">
          Point a webhook at the capture URL above, or send a test from your
          terminal:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel p-4 font-mono text-sm leading-relaxed">
          {sample}
        </pre>
        <div className="mt-3">
          <CopyButton text={sample} label="Copy command" />
        </div>
      </div>
    </div>
  );
}

/* ---------- one endpoint's live view ---------- */

function EndpointView({
  endpoint,
  onRemove,
}: {
  endpoint: Endpoint;
  onRemove: () => void;
}) {
  const { events, loading, live, error } = useEvents(endpoint.slug);
  const now = useNow();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replays, setReplays] = useState<Record<number, ReplayResult[]>>({});

  // pin the newest event once the first batch arrives
  useEffect(() => {
    if (selectedId === null && events.length > 0) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const selected = events.find((e) => e.id === selectedId) ?? null;
  const exp = expiry(endpoint.expires_at, now);

  function addResult(eventId: number, r: ReplayResult) {
    setReplays((prev) => ({ ...prev, [eventId]: [r, ...(prev[eventId] ?? [])] }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-raised px-3 py-2 font-mono text-sm sm:flex-none sm:max-w-xl">
              {endpoint.url}
            </code>
            <CopyButton text={endpoint.url} label="Copy URL" />
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span
              className={`inline-flex items-center gap-2 ${live ? "text-live" : "text-muted"}`}
            >
              <span
                className={`size-2 rounded-full ${live ? "bg-live" : "bg-muted"}`}
              />
              {live ? "Live" : "Reconnecting"}
            </span>
            {exp && (
              <span className={exp.expired ? "text-bad" : "text-muted"}>
                {exp.text}
              </span>
            )}
            <button
              type="button"
              onClick={onRemove}
              title="Remove from this list"
              className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-bad"
            >
              <Trash2 size={15} />
              Remove
            </button>
          </div>
        </div>
      </header>

      {error && events.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto text-warn" size={28} />
            <h2 className="mt-4 text-lg font-semibold">
              Couldn't load this endpoint
            </h2>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="grid flex-1 place-items-center text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <WaitingForRequests url={endpoint.url} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden">
          <div className="border-b border-line lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
              {events.length} {events.length === 1 ? "request" : "requests"}
            </p>
            <EventList
              events={events}
              selectedId={selectedId}
              now={now}
              onSelect={setSelectedId}
            />
          </div>
          <div className="lg:overflow-y-auto">
            {selected && (
              <EventDetail
                key={selected.id}
                slug={endpoint.slug}
                event={selected}
                results={replays[selected.id] ?? []}
                onResult={addResult}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- page shell ---------- */

export default function Workspace() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const now = useNow(30000);
  const { user, logout } = useAuth();
  const [endpoints, setEndpoints] = useState<Endpoint[]>(loadEndpoints);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => saveEndpoints(endpoints), [endpoints]);

  // /app -> newest saved endpoint
  useEffect(() => {
    if (!slug && endpoints.length > 0) {
      navigate(`/app/${endpoints[0].slug}`, { replace: true });
    }
  }, [slug, endpoints, navigate]);

  // A slug we don't have saved (shared link, cleared storage) still works.
  const active = useMemo<Endpoint | null>(() => {
    if (!slug) return null;
    return (
      endpoints.find((e) => e.slug === slug) ?? {
        slug,
        url: `${API}/h/${slug}`,
        expires_at: null,
      }
    );
  }, [slug, endpoints]);

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const ep = await createEndpoint();
      setEndpoints((prev) => [ep, ...prev]);
      navigate(`/app/${ep.slug}`);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function remove(target: string) {
    const rest = endpoints.filter((e) => e.slug !== target);
    setEndpoints(rest);
    navigate(rest[0] ? `/app/${rest[0].slug}` : "/app", { replace: true });
  }

  return (
    <div className="flex h-full">
      {/* sidebar, desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <div className="px-3">
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-signal-hover disabled:opacity-60"
          >
            {creating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Plus size={15} />
            )}
            New endpoint
          </button>
          {createError && endpoints.length > 0 && (
            <p role="alert" className="mt-2 text-xs text-bad">
              {createError}
            </p>
          )}
        </div>

        <nav aria-label="Endpoints" className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="px-2 pb-2 text-xs text-muted">Your endpoints</p>
          {endpoints.length === 0 ? (
            <p className="px-2 text-sm text-muted">None yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {endpoints.map((ep) => {
                const exp = expiry(ep.expires_at, now);
                const current = ep.slug === slug;
                return (
                  <li key={ep.slug}>
                    <Link
                      to={`/app/${ep.slug}`}
                      aria-current={current ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 transition-colors ${current ? "bg-raised" : "hover:bg-raised/60"
                        }`}
                    >
                      <span className="block truncate font-mono text-sm">
                        {ep.slug.slice(0, 12)}
                      </span>
                      <span
                        className={`text-xs ${exp?.expired ? "text-bad" : "text-muted"}`}
                      >
                        {exp?.text ?? "Saved link"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="flex items-center gap-3 border-t border-line p-3">
          <span className="grid size-8 place-items-center rounded-full bg-raised text-sm font-medium uppercase">
            {user?.email?.[0]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm" title={user?.email}>
            {user?.email}
          </span>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-2 text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar, mobile */}
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3 lg:hidden">
          <Webhook size={20} className="text-signal" />
          <select
            aria-label="Endpoint"
            value={slug ?? ""}
            onChange={(e) => navigate(`/app/${e.target.value}`)}
            className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2 py-1.5 font-mono text-sm"
          >
            {!slug && <option value="">No endpoints</option>}
            {endpoints.map((ep) => (
              <option key={ep.slug} value={ep.slug}>
                {ep.slug.slice(0, 12)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            aria-label="New endpoint"
            className="rounded-md bg-signal p-2 text-white disabled:opacity-60"
          >
            <Plus size={16} />
          </button>
          <button type="button" onClick={logout} aria-label="Sign out" className="p-2 text-muted">
            <LogOut size={16} />
          </button>
        </div>
        <main className="min-h-0 flex-1">
          {active ? (
            <EndpointView
              key={active.slug}
              endpoint={active}
              onRemove={() => remove(active.slug)}
            />
          ) : (
            <NoEndpoint
              onCreate={create}
              creating={creating}
              error={createError}
            />
          )}
        </main>
      </div>
    </div>
  );
}
