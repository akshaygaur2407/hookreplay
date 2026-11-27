import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Inbox,
  Info,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  Webhook,
} from "lucide-react";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { EventDetail } from "../components/EventDetail";
import { EventList } from "../components/EventList";
import { Logo } from "../components/Logo";
import { Tooltip } from "../components/Tooltip";
import { useAuth } from "../hooks/useAuth";
import { useEvents } from "../hooks/useEvents";
import { useNow } from "../hooks/useNow";
import { createEndpoint, deleteEndpoint, getEndpoint, listEndpoints } from "../lib/api";
import { expiry } from "../lib/format";
import type { Endpoint, Page, ReplayResult } from "../lib/types";

// keep in sync with MAX_EVENTS_PER_ENDPOINT in backend/app/services/retention.py
const MAX_KEPT_REQUESTS = 500;

function mergeEndpoints(...lists: Endpoint[][]): Endpoint[] {
  const map = new Map<number, Endpoint>();
  for (const list of lists) for (const e of list) map.set(e.id, e);
  return [...map.values()].sort((a, b) => b.id - a.id);
}

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
  const {
    events,
    total,
    hasMore,
    loading,
    loadingMore,
    live,
    error,
    moreError,
    loadMore,
  } = useEvents(endpoint.slug);
  const now = useNow();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replays, setReplays] = useState<Record<number, ReplayResult[]>>({});

  // pin the newest event once the first batch arrives
  useEffect(() => {
    if (selectedId === null && events.length > 0) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const selected = events.find((e) => e.id === selectedId) ?? null;
  const exp = expiry(endpoint.expires_at, now);

  const msLeft = endpoint.expires_at ? Date.parse(endpoint.expires_at) - now : null;
  const expiringSoon = !!exp && !exp.expired && msLeft !== null && msLeft < 60 * 60 * 1000;
  const expiryTone = exp?.expired
    ? "border-bad/30 bg-bad/10 text-bad"
    : expiringSoon
      ? "border-warn/30 bg-warn/10 text-warn"
      : "border-line bg-raised text-fg";

  function addResult(eventId: number, r: ReplayResult) {
    setReplays((prev) => ({ ...prev, [eventId]: [r, ...(prev[eventId] ?? [])] }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {/* capture URL */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2 font-mono text-sm sm:max-w-xl">
              {endpoint.url}
            </code>
            <CopyButton text={endpoint.url} label="Copy URL" />
          </div>

          {/* status */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                live
                  ? "border-live/30 bg-live/10 text-live"
                  : "border-warn/30 bg-warn/10 text-warn"
              }`}
            >
              <span className="relative flex size-2">
                {live && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:animate-none" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    live ? "bg-live" : "animate-pulse bg-warn motion-reduce:animate-none"
                  }`}
                />
              </span>
              {live ? "Live" : "Reconnecting…"}
            </span>

            {exp && (
              <Tooltip
                align="end"
                content={
                  exp.expired
                    ? "This endpoint has expired. New requests sent to its URL are rejected with a 410 response. Create a new endpoint to keep receiving webhooks. Requests already captured stay visible."
                    : "Each capture URL stops accepting requests 24 hours after it is created. After that, anything sent to it is rejected with a 410 response. Requests already captured stay visible."
                }
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${expiryTone}`}
                >
                  <Clock size={13} />
                  {exp.text}
                  <Info size={12} className="opacity-60" />
                </span>
              </Tooltip>
            )}

            <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line sm:block" />

            <button
              type="button"
              onClick={onRemove}
              title="Delete endpoint and its requests"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-bad/50 hover:bg-bad/10 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/40"
            >
              <Trash2 size={15} />
              Delete
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
              {events.length < total
                ? `Showing ${events.length} of ${total} requests`
                : `${total} ${total === 1 ? "request" : "requests"}`}
            </p>
            <EventList
              events={events}
              selectedId={selectedId}
              now={now}
              onSelect={setSelectedId}
            />
            {hasMore && (
              <div className="border-t border-line p-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-raised disabled:opacity-60"
                >
                  {loadingMore && <Loader2 size={14} className="animate-spin" />}
                  Load older requests
                </button>
                {moreError && (
                  <p role="alert" className="mt-2 text-xs text-bad">
                    {moreError}
                  </p>
                )}
              </div>
            )}
            {!hasMore && total >= MAX_KEPT_REQUESTS && (
              <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
                Each endpoint keeps its newest {MAX_KEPT_REQUESTS} requests. Older ones are
                removed automatically.
              </p>
            )}
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

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointTotal, setEndpointTotal] = useState(0);
  const [endpointsHasMore, setEndpointsHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMoreEndpoints, setLoadingMoreEndpoints] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Paging cursor = the oldest id fetched through list pages. Kept apart from the
  // array on purpose: a deep-linked old endpoint also lives in the array and
  // must not move the cursor, or "load more" would skip everything in between.
  const cursor = useRef<number | null>(null);

  function applyPage(page: Page<Endpoint>, replace: boolean) {
    setEndpoints((prev) => (replace ? page.items : mergeEndpoints(prev, page.items)));
    setEndpointTotal(page.total);
    setEndpointsHasMore(page.has_more);
    if (page.items.length > 0) cursor.current = page.items[page.items.length - 1].id;
  }

  // first page of my endpoints
  useEffect(() => {
    let cancelled = false;
    listEndpoints()
      .then((page) => {
        if (cancelled) return;
        setEndpoints(page.items);
        setEndpointTotal(page.total);
        setEndpointsHasMore(page.has_more);
        cursor.current =
          page.items.length > 0 ? page.items[page.items.length - 1].id : null;
      })
      .catch((e) => {
        if (!cancelled) setListError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve the URL: /app -> newest endpoint. A slug that isn't on the loaded page
  // may still be mine (older than the first page), so ask the server before redirecting.
  useEffect(() => {
    if (loadingList) return;
    if (slug && endpoints.some((e) => e.slug === slug)) return;

    if (!slug) {
      if (endpoints.length > 0) {
        navigate(`/app/${endpoints[0].slug}`, { replace: true });
      }
      return;
    }

    let cancelled = false;
    getEndpoint(slug)
      .then((ep) => {
        if (!cancelled) setEndpoints((prev) => mergeEndpoints(prev, [ep]));
      })
      .catch(() => {
        if (cancelled) return;
        navigate(endpoints[0] ? `/app/${endpoints[0].slug}` : "/app", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [loadingList, slug, endpoints, navigate]);

  const active = endpoints.find((e) => e.slug === slug) ?? null;

  async function loadMoreEndpoints() {
    if (loadingMoreEndpoints || cursor.current === null) return;
    setLoadingMoreEndpoints(true);
    setCreateError(null);
    try {
      applyPage(await listEndpoints(cursor.current), false);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setLoadingMoreEndpoints(false);
    }
  }

  async function create() {
    setCreating(true);
    setCreateError(null);
    try {
      const ep = await createEndpoint();
      setEndpoints((prev) => mergeEndpoints([ep], prev));
      setEndpointTotal((t) => t + 1);
      navigate(`/app/${ep.slug}`);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function askDelete(target: string) {
    setDeleteError(null);
    setPendingDelete(target);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEndpoint(pendingDelete);

      let rest = endpoints.filter((e) => e.slug !== pendingDelete);
      setEndpoints(rest);
      setEndpointTotal((t) => Math.max(0, t - 1));

      // The loaded page may have been the only thing we knew about. If more exist
      // on the server, reload the first page instead of showing "no endpoints".
      if (rest.length === 0 && endpointsHasMore) {
        const page = await listEndpoints();
        applyPage(page, true);
        rest = page.items;
      }

      setPendingDelete(null);
      navigate(rest[0] ? `/app/${rest[0].slug}` : "/app", { replace: true });
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
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
          <p className="flex items-center justify-between px-2 pb-2 text-xs text-muted">
            <span>Your endpoints</span>
            <span>{endpointTotal}</span>
          </p>
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
                      className={`block rounded-lg px-3 py-2 transition-colors ${
                        current ? "bg-raised" : "hover:bg-raised/60"
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

          {endpointsHasMore && (
            <div className="px-1 py-3">
              <button
                type="button"
                onClick={loadMoreEndpoints}
                disabled={loadingMoreEndpoints}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-raised disabled:opacity-60"
              >
                {loadingMoreEndpoints && <Loader2 size={13} className="animate-spin" />}
                Show more ({Math.max(0, endpointTotal - endpoints.length)} left)
              </button>
            </div>
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
            onChange={(e) =>
              e.target.value === "__more__"
                ? loadMoreEndpoints()
                : navigate(`/app/${e.target.value}`)
            }
            className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2 py-1.5 font-mono text-sm"
          >
            {!slug && <option value="">No endpoints</option>}
            {endpoints.map((ep) => (
              <option key={ep.slug} value={ep.slug}>
                {ep.slug.slice(0, 12)}
              </option>
            ))}
            {endpointsHasMore && (
              <option value="__more__">
                Load more… ({Math.max(0, endpointTotal - endpoints.length)} left)
              </option>
            )}
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
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            className="p-2 text-muted"
          >
            <LogOut size={16} />
          </button>
        </div>

        <main className="min-h-0 flex-1">
          {loadingList ? (
            <div className="grid h-full place-items-center text-muted">
              <Loader2 className="animate-spin" />
            </div>
          ) : listError ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <p role="alert" className="text-sm text-bad">
                {listError}
              </p>
            </div>
          ) : active ? (
            <EndpointView
              key={active.slug}
              endpoint={active}
              onRemove={() => askDelete(active.slug)}
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
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this endpoint?"
        description="This permanently deletes the capture URL and every request captured on it. Anything still sending to this URL will start getting 404 responses."
        detail={pendingDelete ?? undefined}
        confirmLabel="Delete endpoint"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}