
export interface HookEvent {
  id: number;
  endpoint_slug: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body_preview: string;
}

export interface Endpoint {
  slug: string;
  url: string;
  expires_at: string;
}

export interface ReplayResult {
  replay_id: number;
  status: number;
}