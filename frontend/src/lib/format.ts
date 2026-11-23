import type { HookEvent } from "./types";

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function expiry(
  iso: string | null,
  now: number,
): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: "Expired", expired: true };
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  return {
    text: h > 0 ? `Expires in ${h}h ${mins % 60}m` : `Expires in ${mins}m`,
    expired: false,
  };
}

export function formatBody(ev: HookEvent): { text: string; isJson: boolean } {
  const raw = ev.body_preview;
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

export function requestLine(ev: HookEvent): string {
  return ev.path + (ev.query_string ? `?${ev.query_string}` : "");
}
