import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  createClient: vi.fn((url: string, key: string, options: any) => ({
    url, key, options, auth: { getSession: vi.fn() },
  })),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: captured.createClient }));

describe("Supabase client factories", () => {
  it("creates the browser client and strips opaque API keys from Authorization", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://public.example.test/");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_browser");
    vi.resetModules();
    const { supabase } = await import("@/integrations/supabase/client");
    void supabase.auth;
    const config = captured.createClient.mock.calls.at(-1)!;
    expect(config[0]).toBe("https://public.example.test/");
    expect(config[1]).toBe("sb_publishable_browser");
    const fetcher = config[2].global.fetch as typeof fetch;
    const nativeFetch = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ headers: new Headers(init?.headers).get("apikey") })));
    vi.stubGlobal("fetch", nativeFetch);
    await fetcher(new Request("https://public.example.test/rest/v1", { headers: { Authorization: "Bearer sb_publishable_browser" } }));
    const headers = new Headers(nativeFetch.mock.calls[0][1]?.headers);
    expect(headers.get("apikey")).toBe("sb_publishable_browser");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("requires server credentials before creating the admin client", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.resetModules();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    expect(() => supabaseAdmin.auth).toThrow("Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  });

  it("creates the server admin client and applies the service key header", async () => {
    vi.stubEnv("SUPABASE_URL", "https://server.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_server");
    vi.resetModules();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.auth;
    const config = captured.createClient.mock.calls.at(-1)!;
    expect(config[0]).toBe("https://server.example.test");
    const fetcher = config[2].global.fetch as typeof fetch;
    const nativeFetch = vi.fn(async (_request: RequestInfo | URL, init?: RequestInit) => new Response(new Headers(init?.headers).get("apikey")));
    vi.stubGlobal("fetch", nativeFetch);
    await fetcher(new Request("https://server.example.test/rest/v1", { headers: { Authorization: "Bearer sb_secret_server" } }));
    const headers = new Headers(nativeFetch.mock.calls[0][1]?.headers);
    expect(headers.get("apikey")).toBe("sb_secret_server");
    expect(headers.has("Authorization")).toBe(false);
  });
});
