import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endpoints } from "@/lib/api/endpoints";

function respond(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(payload),
    blob: vi.fn().mockResolvedValue(new Blob(["x"])),
    clone() {
      return this;
    },
  } as unknown as Response;
}

describe("API contract modules", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(respond({})) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function lastCall(): [string, RequestInit] {
    return vi.mocked(globalThis.fetch).mock.calls.at(-1) as [string, RequestInit];
  }

  it("logs in with the documented LoginRequest schema", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(respond({ access_token: "t", token_type: "bearer" })) as typeof fetch;
    await endpoints.auth.login("user@example.com", "secret");
    const [url, init] = lastCall();
    expect(url).toContain("/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "user@example.com",
      password: "secret",
    });
  });

  it("uses the requirement lifecycle routes and optimistic concurrency field", async () => {
    await endpoints.requirements.update("req-1", { priority: "high", expected_version: 3 });
    expect(lastCall()[0]).toContain("/api/v1/requirements/req-1");
    expect(lastCall()[1].method).toBe("PATCH");
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({
      priority: "high",
      expected_version: 3,
    });

    await endpoints.requirements.review("req-1", { decision: "approved", expected_version: 3 });
    expect(lastCall()[0]).toContain("/api/v1/requirements/req-1/review");
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({
      decision: "approved",
      expected_version: 3,
    });
  });

  it("passes backend-supported requirement filters as query parameters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(respond([])) as typeof fetch;
    await endpoints.requirements.list("p1", {
      priority: "high",
      review_status: "approved",
      tag: "api",
    });
    const url = lastCall()[0];
    expect(url).toContain("priority=high");
    expect(url).toContain("review_status=approved");
    expect(url).toContain("tag=api");
  });

  it("sends multipart uploads and workflow run decisions to real endpoints", async () => {
    const file = new File(["text"], "req.txt", { type: "text/plain" });
    await endpoints.requirements.upload("p1", file);
    expect(lastCall()[0]).toContain("/api/v1/projects/p1/requirements");
    expect(lastCall()[1].body).toBeInstanceOf(FormData);

    await endpoints.runs.decide("run-1", "approve", { accepted: true });
    expect(lastCall()[0]).toContain("/api/v1/runs/run-1/approve");
    expect(lastCall()[1].method).toBe("POST");
  });

  it("never calls an endpoint that the backend does not expose", async () => {
    const actions = [
      () => endpoints.projects.list(),
      () => endpoints.artifacts.types(),
      () => endpoints.traceability.graph("p1"),
      () => endpoints.prompts.list(),
      () => endpoints.analytics.stats("p1"),
      () => endpoints.analytics.auditLogs(),
      () => endpoints.analytics.health(),
    ];
    await Promise.all(actions.map((action) => action()));
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url));
    expect(
      urls.some(
        (url) =>
          url.includes("/admin/") || url.includes("/invitations") || url.includes("/baselines"),
      ),
    ).toBe(false);
    expect(urls).toHaveLength(7);
  });
});
