import { apiRequest, type ApiRequestOptions } from "./api/client";

export type { ApiDownload } from "./api/client";
export { apiUrl, setTokenProvider, ApiError } from "./api/client";

export type Project = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};
export type ProjectMonitoringDashboard = {
  available: boolean;
  dashboard_url: string | null;
  message: string | null;
};
export type Requirement = {
  id: string;
  filename: string;
  doc_type: string;
  chunks_indexed: number;
  created_at: string;
  content?: string;
};
export type Artifact = {
  id: string;
  artifact_type: string;
  title: string;
  content: Record<string, unknown>;
  version: number;
  created_at: string;
};
export type User = { id: string; email: string; full_name: string; role: string };
export type WorkflowRunMetrics = {
  run_count: number;
  status_counts: Record<string, number>;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_latency_ms: number;
  average_latency_ms: number;
  estimated_cost_usd: number | null;
  prompt_variant_metrics: Array<{
    node_id: string;
    version: string | null;
    experiment_id: string | null;
    run_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    latency_ms: number;
    average_latency_ms: number;
    estimated_cost_usd: number | null;
    average_review_score: number | null;
  }>;
};

/**
 * Backwards-compatible API entry point used by the existing workspace and
 * tests. New code should use the typed modules under `src/lib/api/`.
 */
export async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const options: ApiRequestOptions = {
    ...init,
    headers,
    ...(token ? { token } : {}),
    body: init.body ?? undefined,
  };
  return apiRequest<T>(path, options);
}
