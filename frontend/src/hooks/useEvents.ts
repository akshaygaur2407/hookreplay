import { useEffect, useState } from "react";
import { API, listEvents } from "../lib/api";
import type { HookEvent } from "../lib/types";

export function useEvents(slug: string) {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEvents(slug)
      .then((e) => !cancelled && setEvents(e))
      .catch((e) => !cancelled && setError(e.message));

    const es = new EventSource(`${API}/api/endpoints/${slug}/stream`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false); // EventSource auto-reconnects
    es.onmessage = (m) => {
      const ev: HookEvent = JSON.parse(m.data);
      // dedupe: an event can arrive via both the initial fetch and SSE
      setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev]));
    };

    return () => { cancelled = true; es.close(); };
  }, [slug]);

  return { events, live, error };
}