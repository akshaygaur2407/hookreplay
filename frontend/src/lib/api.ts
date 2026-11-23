import type { Endpoint, HookEvent, ReplayResult } from "./types";

export const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const createEndpoint = () =>
  fetch(`${API}/api/endpoints`, { method: "POST" }).then(json<Endpoint>);

export const listEvents = (slug: string) =>
  fetch(`${API}/api/endpoints/${slug}/events`).then(json<HookEvent[]>);

export const replayEvent = (slug: string, id: number, target_url: string) =>
  fetch(`${API}/api/endpoints/${slug}/events/${id}/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_url }),
  }).then(json<ReplayResult>);