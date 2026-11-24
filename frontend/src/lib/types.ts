
export interface HookEvent {
  id: number;
  endpoint_slug: string;
  method: string;
  path: string;
  query_string: string | null;
  headers: Record<string, string>;
  body_preview: string;
  received_at: string;
  source_ip: string | null;
  body_size: number;
  content_type: string | null;
}

export interface Endpoint {
  slug: string;
  url: string;
  expires_at: string;
}

export interface ReplayResult {
  replay_id: number;
  status_code: number | null;
  duration_ms: number;
  target_url: string;
  error: string | null;
  response_body: string | null;
}
