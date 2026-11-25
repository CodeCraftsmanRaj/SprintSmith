import { asRecord, asText, filenameFromContentDisposition } from "../normalize";

const DEFAULT_BASE_URL = "http://localhost:8002";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Normalized error carrying the HTTP status and the backend-provided detail. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  /** Bearer token. Falls back to the configured token provider. */
  token?: string;
  /** JSON-serializable payload, FormData, Blob or URLSearchParams. */
  body?: unknown;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries for idempotent requests only. Mutations are never retried. */
  retries?: number;
  /** Download handling. JSON is the default. */
  responseType?: "json" | "blob" | "text";
  /** Used when Content-Disposition is missing from a download response. */
  fallbackFilename?: string;
}

let tokenProvider: (() => string | null) | null = null;

/** Registers a token source (TanStack Query hooks use this instead of passing tokens). */
export function setTokenProvider(provider: (() => string | null) | null): void {
  tokenProvider = provider;
}

export function getApiBase(): string {
  const configured = asText(asRecord(import.meta.env)["VITE_API_URL"], DEFAULT_BASE_URL);
  return configured.replace(/\/$/, "");
}

export const apiUrl = getApiBase();

function currentToken(option?: string): string | null {
  if (option) return option;
  if (tokenProvider) return tokenProvider();
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("sprintsmith_access_token");
  } catch {
    return null;
  }
}

function isIdempotent(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function hasBody(body: unknown): boolean {
  return body !== undefined && body !== null;
}

function toBodyInit(body: unknown): BodyInit | undefined {
  if (!hasBody(body)) return undefined;
  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    typeof body === "string"
  ) {
    return body;
  }
  return JSON.stringify(body);
}

function buildHeaders(init: ApiRequestOptions, body: unknown): Headers {
  const headers = new Headers(init.headers);
  headers.set("Accept", init.responseType === "blob" ? "*/*" : "application/json");
  const token = currentToken(init.token);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    hasBody(body) &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams) &&
    typeof body !== "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail: unknown = null;
  try {
    const payload = (await response.json()) as { detail?: unknown } | null;
    detail = payload?.detail ?? payload;
  } catch {
    // Non-JSON error bodies keep the status-only message.
  }
  if (typeof detail === "string" && detail) return new ApiError(detail, response.status, detail);
  if (detail && typeof detail === "object") {
    return new ApiError(JSON.stringify(detail), response.status, detail);
  }
  return new ApiError(`Request failed (${response.status})`, response.status, detail);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Performs a fetch with timeout, cancellation and safe retry of idempotent requests. */
export async function fetchApi(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const attempts = isIdempotent(method) ? Math.max(0, options.retries ?? 0) + 1 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });

    try {
      const init: RequestInit = {
        ...options,
        method,
        headers: buildHeaders(options, options.body),
        body: toBodyInit(options.body) ?? null,
        signal: controller.signal,
      };
      const response = await fetch(`${getApiBase()}${path}`, init);
      if (!response.ok) {
        const error = await toApiError(response);
        if (attempt < attempts - 1 && RETRYABLE_STATUSES.has(response.status)) {
          lastError = error;
          await delay(200 * (attempt + 1));
          continue;
        }
        throw error;
      }
      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw error;
      lastError = error;
      if (attempt < attempts - 1 && isIdempotent(method)) {
        await delay(200 * (attempt + 1));
        continue;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("The request timed out. Please try again.", 408);
      }
      throw new ApiError(
        `Cannot reach the API at ${getApiBase()}. Start the backend and check VITE_API_URL.`,
        0,
        lastError,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  throw lastError instanceof ApiError
    ? lastError
    : new ApiError("The request could not be completed.", 0, lastError);
}

/** Generic typed request. 204 responses resolve to undefined. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetchApi(path, options);
  if (response.status === 204) return undefined as T;
  if (options.responseType === "blob") return (await response.blob()) as T;
  if (options.responseType === "text") return (await response.text()) as T;
  return (await response.json()) as T;
}

export interface ApiDownload {
  blob: Blob;
  filename: string;
}

/** Binary download with safe filename parsing and empty-file detection. */
export async function apiDownload(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiDownload> {
  const response = await fetchApi(path, { ...options, responseType: "blob" });
  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new ApiError(
      "The server returned an empty file. No download was created.",
      response.status,
    );
  }
  return {
    blob,
    filename: filenameFromContentDisposition(
      response.headers.get("Content-Disposition"),
      options.fallbackFilename ?? "sprintsmith-download",
    ),
  };
}

/** Triggers a browser download for an API blob, revoking the object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
