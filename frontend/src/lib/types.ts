export interface HookEvent {
  id: number;
  method: string;
  path: string;
  query_string: string;
  headers: [string, string][];
  content_type: string | null;
  source_ip: string | null;
  received_at: string;
  body_size: number;
  body_preview: string;
}

export interface Endpoint { slug: string; url: string; expires_at: string }

export interface ReplayResult {
  replay_id: number;
  target_url: string;
  status_code: number | null;
  response_body: string | null;
  error: string | null;
  duration_ms: number;
}