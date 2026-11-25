import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, apiUrl } from "@/lib/backend-api";

describe("backend-api", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("makes a successful GET request and returns json", async () => {
    const mockData = { id: "123", name: "SprintSmith" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockData),
    } as unknown as Response);

    const result = await api<typeof mockData>("/api/v1/projects");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${apiUrl}/api/v1/projects`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(mockData);
  });

  it("includes Authorization Bearer header when token is provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);

    await api("/api/v1/auth/me", "sample-token-123");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer sample-token-123");
  });

  it("sets Content-Type to application/json for body payloads by default", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const payload = JSON.stringify({ name: "New Project" });
    await api("/api/v1/projects", "token", { method: "POST", body: payload });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not override Content-Type when body is FormData", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ingest_job_id: "job-1" }),
    } as unknown as Response);

    const formData = new FormData();
    formData.append("file", new Blob(["test content"]), "req.txt");

    await api("/api/v1/requirements", "token", { method: "POST", body: formData });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("returns undefined for 204 No Content responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    } as unknown as Response);

    const result = await api<void>("/api/v1/logout", "token", { method: "POST" });
    expect(result).toBeUndefined();
  });

  it("throws detailed error when response is not ok and JSON contains string detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ detail: "Invalid project name" }),
    } as unknown as Response);

    await expect(api("/api/v1/projects", "token", { method: "POST" })).rejects.toThrow(
      "Invalid project name",
    );
  });

  it("throws JSON-stringified error when detail is an object", async () => {
    const errorDetail = { field: "email", message: "Email is required" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ detail: errorDetail }),
    } as unknown as Response);

    await expect(api("/api/v1/auth/login", undefined, { method: "POST" })).rejects.toThrow(
      JSON.stringify(errorDetail),
    );
  });

  it("throws fallback status code message when error response body is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("HTML error page")),
    } as unknown as Response);

    await expect(api("/api/v1/projects")).rejects.toThrow("Request failed (500)");
  });

  it("throws network connection failure message when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api("/api/v1/health")).rejects.toThrow(
      `Cannot reach the API at ${apiUrl}. Start the backend and check VITE_API_URL.`,
    );
  });
});
