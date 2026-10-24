const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8002").replace(/\/$/, "");

export type Project = { id: string; name: string; description: string; created_at: string };
export type Requirement = { id: string; filename: string; doc_type: string; chunks_indexed: number; created_at: string; content?: string };
export type Artifact = { id: string; artifact_type: string; title: string; content: Record<string, unknown>; version: number; created_at: string };
export type User = { id: string; email: string; full_name: string; role: string };

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
