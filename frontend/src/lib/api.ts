import type { Endpoint, HookEvent, ReplayResult, Page } from "./types";

export const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include", // sends and receives the session cookie
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      detail = Array.isArray(data.detail) ? data.detail[0]?.msg ?? detail : data.detail ?? detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export const createEndpoint = () => api<Endpoint>("/api/endpoints", { method: "POST" });

export const listEvents = (slug: string, before?: number) =>
  api<Page<HookEvent>>(
    `/api/endpoints/${slug}/events?limit=50${before ? `&before=${before}` : ""}`,
  );

export const getEndpoint = (slug: string) => api<Endpoint>(`/api/endpoints/${slug}`);

export const listEndpoints = (before?: number) =>
  api<Page<Endpoint>>(`/api/endpoints?limit=50${before ? `&before=${before}` : ""}`);

export const deleteEndpoint = (slug: string) =>
  api<{ deleted: boolean }>(`/api/endpoints/${slug}`, {
    method: "DELETE",
  });

export const replayEvent = (slug: string, id: number, target_url: string) =>
  api<ReplayResult>(`/api/endpoints/${slug}/events/${id}/replay`, {
    method: "POST",
    body: JSON.stringify({ target_url }),
  });

export async function getEventBody(slug: string, id: number): Promise<Uint8Array> {
  const res = await fetch(`${API}/api/endpoints/${slug}/events/${id}/body`, {
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, `Could not load request body (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}