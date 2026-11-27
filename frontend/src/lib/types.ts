
export interface HookEvent {
  id: number;
  method: string;
  path: string;
  query_string: string | null;
  headers: [string, string][];
  body_preview: string;
  body_truncated: boolean;
  received_at: string;
  source_ip: string | null;
  body_size: number;
  content_type: string | null;
}

export interface Endpoint {
  id: number;
  slug: string;
  url: string;
  expires_at: string | null;
}

export interface ReplayResult {
  replay_id: number;
  status_code: number | null;
  duration_ms: number;
  target_url: string;
  error: string | null;
  response_body: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  has_more: boolean;
}