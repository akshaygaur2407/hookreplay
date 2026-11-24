
import { useEffect, useState } from "react";
import { API, listEvents } from "../lib/api";
import type { HookEvent } from "../lib/types";

export function useEvents(slug: string) {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listEvents(slug)
      .then((fetched) => {
        if (cancelled) return;

        // Merge instead of overwrite: SSE events may have arrived before this resolved
        setEvents((prev) => {
          const seen = new Set(prev.map((p) => p.id));

          return [...prev, ...fetched.filter((f) => !seen.has(f.id))].sort(
            (a, b) => b.id - a.id,
          );
        });

        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    const es = new EventSource(
      `${API}/api/endpoints/${slug}/stream`,
      { withCredentials: true },
    );

    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as HookEvent;

      setEvents((prev) =>
        prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev],
      );
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [slug]);

  return { events, loading, live, error };
}