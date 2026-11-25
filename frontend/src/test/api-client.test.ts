import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDownload, apiRequest, ApiError, fetchApi, setTokenProvider } from "@/lib/api/client";

function mockResponse(options: {
  status?: number;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
  blob?: Blob;
}): Response {
  const status = options.status ?? 200;
  const payload = options.json;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(options.headers ?? {}),
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(options.body ?? ""),
    blob: vi.fn().mockResolvedValue(options.blob ?? new Blob([])),
    clone() {
      return this;
    },
  } as unknown as Response;
}

describe("typed api client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setTokenProvider(() => "provider-token");
  });

  afterEach(() => {
    setTokenProvider(null);
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("uses the token provider and skips Content-Type for FormData", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ json: { ok: true } })) as typeof fetch;
    const form = new FormData();
    form.append("file", new Blob(["req"]), "req.txt");
    await apiRequest("/api/v1/projects", { method: "POST", body: form });
    const call = vi.mocked(globalThis.fetch).mock.calls.at(0);
    expect(call).toBeDefined();
    const headers = (call?.[1]?.headers as Headers | undefined) ?? new Headers();
    expect(headers.get("Authorization")).toBe("Bearer provider-token");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("normalizes validation errors without losing backend detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        status: 422,
        json: { detail: [{ loc: ["body", "name"], msg: "required" }] },
      }),
    ) as typeof fetch;
    const error = await apiRequest("/api/v1/projects", { method: "POST", body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).message).toContain("required");
  });

  it("does not retry unsafe mutations", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 500, json: {} })) as typeof fetch;
    await expect(
      apiRequest("/api/v1/projects", { method: "POST", body: {}, retries: 2 }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries idempotent reads on transient failures", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 503, json: {} }))
      .mockResolvedValueOnce(mockResponse({ json: [{ id: "p1" }] })) as typeof fetch;
    const promise = apiRequest<{ id: string }[]>("/api/v1/projects", { retries: 1 });
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toEqual([{ id: "p1" }]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts a request through an external signal", async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as typeof fetch;
    const promise = fetchApi("/api/v1/projects", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(DOMException);
  });

  it("downloads a blob with a safe filename", async () => {
    const blob = new Blob(["spec"], { type: "application/yaml" });
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse({
        blob,
        headers: { "Content-Disposition": 'attachment; filename="api-spec.yaml"' },
      }),
    ) as typeof fetch;
    const result = await apiDownload("/api/v1/artifacts/a1/export?format=yaml");
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe("api-spec.yaml");
  });

  it("reports empty binary responses instead of downloading a broken file", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ blob: new Blob([]) })) as typeof fetch;
    await expect(apiDownload("/api/v1/artifacts/a1/export?format=pdf")).rejects.toThrow(
      /empty file/i,
    );
  });
});
