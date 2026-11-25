const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8002").replace(/\/$/, "");

export type Project = { id: string; name: string; description: string; created_at: string };
export type ProjectMonitoringDashboard = { available: boolean; dashboard_url: string | null; message: string | null };
export type Requirement = { id: string; filename: string; doc_type: string; chunks_indexed: number; created_at: string; content?: string };
export type Artifact = { id: string; artifact_type: string; title: string; content: Record<string, unknown>; version: number; created_at: string };
export type User = { id: string; email: string; full_name: string; role: string };
export type WorkflowRunMetrics = { run_count: number; status_counts: Record<string, number>; prompt_tokens: number; completion_tokens: number; total_tokens: number; total_latency_ms: number; average_latency_ms: number; estimated_cost_usd: number | null; prompt_variant_metrics: Array<{ node_id: string; version: string | null; experiment_id: string | null; run_count: number; prompt_tokens: number; completion_tokens: number; latency_ms: number; average_latency_ms: number; estimated_cost_usd: number | null; average_review_score: number | null }> };

export async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach the API at ${API_BASE}. Start the backend and check VITE_API_URL.`);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail ?? payload);
    } catch { /* keep status message */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiUrl = API_BASE;
