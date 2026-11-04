import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: fetchMock } }));

import server from "@/server";

describe("server entry error handling", () => {
  beforeEach(() => fetchMock.mockReset());

  it("passes through normal responses", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const response = await server.fetch(new Request("https://app.test"), {}, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("replaces swallowed SSR errors with the friendly HTML error page", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ unhandled: true, message: "HTTPError" }), {
      status: 500, headers: { "content-type": "application/json" },
    }));
    const response = await server.fetch(new Request("https://app.test"), {}, {});
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("This page didn't load");
  });

  it("passes through unrelated server errors that are not H3 JSON failures", async () => {
    fetchMock.mockResolvedValue(new Response("upstream error", { status: 500, headers: { "content-type": "text/plain" } }));
    const response = await server.fetch(new Request("https://app.test"), {}, {});
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("upstream error");
  });
});
