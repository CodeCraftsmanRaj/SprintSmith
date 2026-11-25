import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverHandler: undefined as ((args: any) => Promise<any>) | undefined,
  clientHandler: undefined as ((args: any) => Promise<any>) | undefined,
  request: undefined as Request | undefined,
  claimsResult: { data: { claims: { sub: "user-1" } }, error: null } as any,
  getSession: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (handler: typeof mocks.serverHandler) => { mocks.serverHandler = handler; return handler; },
    client: (handler: typeof mocks.clientHandler) => { mocks.clientHandler = handler; return handler; },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => mocks.request }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getClaims: vi.fn(async () => mocks.claimsResult) } })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

describe("Supabase auth middleware", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://db.example.test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.request = new Request("https://app.example.test", {
      headers: { authorization: "Bearer header.payload.signature" },
    });
    mocks.claimsResult = { data: { claims: { sub: "user-1", role: "authenticated" } }, error: null };
  });

  it("attaches verified claims and user id to the next function context", async () => {
    const next = vi.fn(async (arg) => arg);
    await mocks.serverHandler!({ next });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ userId: "user-1", claims: expect.objectContaining({ sub: "user-1" }) }),
    }));
    expect(requireSupabaseAuth).toBe(mocks.serverHandler);
  });

  it.each([
    [undefined, "Unauthorized: No request headers available"],
    [new Request("https://app.example.test"), "Unauthorized: No authorization header provided"],
    [new Request("https://app.example.test", { headers: { authorization: "Basic abc" } }), "Unauthorized: Only Bearer tokens are supported"],
    [{ headers: { get: () => "Bearer " } } as Request, "Unauthorized: No token provided"],
    [new Request("https://app.example.test", { headers: { authorization: "Bearer malformed" } }), "Unauthorized: Invalid token"],
  ])("rejects malformed request credentials", async (request, message) => {
    mocks.request = request;
    await expect(mocks.serverHandler!({ next: vi.fn() })).rejects.toThrow(message);
  });

  it("rejects invalid claims and missing user ids", async () => {
    mocks.claimsResult = { data: null, error: new Error("invalid") };
    await expect(mocks.serverHandler!({ next: vi.fn() })).rejects.toThrow("Unauthorized: Invalid token");
    mocks.claimsResult = { data: { claims: {} }, error: null };
    await expect(mocks.serverHandler!({ next: vi.fn() })).rejects.toThrow("Unauthorized: No user ID found in token");
  });

  it("rejects missing environment settings", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await expect(mocks.serverHandler!({ next: vi.fn() })).rejects.toThrow("Missing Supabase environment variable(s): SUPABASE_URL");
  });

  it("attaches a session bearer token on client calls and omits it when signed out", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: "session-token" } } });
    const withToken = await mocks.clientHandler!({ next: vi.fn(async (args) => args) });
    expect(withToken.headers).toEqual({ Authorization: "Bearer session-token" });
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    const anonymous = await mocks.clientHandler!({ next: vi.fn(async (args) => args) });
    expect(anonymous.headers).toEqual({});
    expect(attachSupabaseAuth).toBe(mocks.clientHandler);
  });
});
