import type { Endpoint } from "./types";

const ENDPOINTS_KEY = "hookreplay:endpoints";
const TARGET_KEY = "hookreplay:target";

export function loadEndpoints(): Endpoint[] {
  try {
    const raw = localStorage.getItem(ENDPOINTS_KEY);
    return raw ? (JSON.parse(raw) as Endpoint[]) : [];
  } catch {
    return [];
  }
}

export function saveEndpoints(list: Endpoint[]) {
  try {
    localStorage.setItem(ENDPOINTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable; the list just won't persist */
  }
}

export function loadTarget(): string {
  try {
    return localStorage.getItem(TARGET_KEY) ?? "http://localhost:3000/webhook";
  } catch {
    return "http://localhost:3000/webhook";
  }
}

export function saveTarget(url: string) {
  try {
    localStorage.setItem(TARGET_KEY, url);
  } catch {
    /* ignore */
  }
}
