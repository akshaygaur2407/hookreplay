import { useCallback, useEffect, useRef, useState } from "react";
import { API, listEvents } from "../lib/api";
import type { HookEvent } from "../lib/types";

function mergeById(...lists: HookEvent[][]): HookEvent[] {
  const map = new Map<number, HookEvent>();
  for (const list of lists) for (const e of list) map.set(e.id, e);
  return [...map.values()].sort((a, b) => b.id - a.id);
}

export function useEvents(slug: string) {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  // ids already shown, so a live event and a fetched page never double-count
  const known = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    const seen = known.current;
    seen.clear();
    setEvents([]);
    setTotal(0);
    setHasMore(false);
    setLoading(true);
    setError(null);
    setMoreError(null);

    listEvents(slug)
      .then((page) => {
        if (cancelled) return;
        page.items.forEach((e) => seen.add(e.id));
        // merge: a live event may have arrived before this response did
        setEvents((prev) => mergeById(page.items, prev));
        setTotal(page.total);
        setHasMore(page.has_more);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const es = new EventSource(`${API}/api/endpoints/${slug}/stream`, {
      withCredentials: true,
    });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (msg) => {
      let ev: HookEvent;
      try {
        ev = JSON.parse(msg.data) as HookEvent;
      } catch {
        return;
      }
      if (seen.has(ev.id)) return;
      seen.add(ev.id);
      setEvents((prev) => [ev, ...prev]);
      setTotal((t) => t + 1);
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [slug]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || events.length === 0) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const oldest = events[events.length - 1].id;
      const page = await listEvents(slug, oldest);
      page.items.forEach((e) => known.current.add(e.id));
      setEvents((prev) => mergeById(prev, page.items));
      setTotal(page.total);
      setHasMore(page.has_more);
    } catch (e) {
      setMoreError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [slug, events, hasMore, loadingMore]);

  return {
    events,
    total: Math.max(total, events.length),
    hasMore,
    loading,
    loadingMore,
    live,
    error,
    moreError,
    loadMore,
  };
}