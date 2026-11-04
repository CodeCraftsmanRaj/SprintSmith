import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  errorHandler: undefined as ((args: { next: () => Promise<unknown> }) => Promise<unknown>) | undefined,
  csrfOptions: undefined as { filter: (ctx: { handlerType: string }) => boolean } | undefined,
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: typeof mocks.errorHandler) => { mocks.errorHandler = handler; return handler; } }),
  createCsrfMiddleware: (options: typeof mocks.csrfOptions) => { mocks.csrfOptions = options; return "csrf-middleware"; },
  createStart: (factory: () => unknown) => factory(),
}));
vi.mock("@/integrations/supabase/auth-attacher", () => ({ attachSupabaseAuth: "auth-middleware" }));

import { startInstance } from "@/start";

describe("TanStack Start configuration", () => {
  it("registers error, CSRF, and Supabase authentication middleware", () => {
    expect(startInstance.requestMiddleware).toHaveLength(2);
    expect(startInstance.functionMiddleware).toEqual(["auth-middleware"]);
    expect(mocks.csrfOptions!.filter({ handlerType: "serverFn" })).toBe(true);
    expect(mocks.csrfOptions!.filter({ handlerType: "request" })).toBe(false);
  });

  it("returns next results, rethrows HTTP errors, and renders other errors", async () => {
    await expect(mocks.errorHandler!({ next: async () => "ok" })).resolves.toBe("ok");
    const httpError = Object.assign(new Error("not found"), { statusCode: 404 });
    await expect(mocks.errorHandler!({ next: async () => { throw httpError; } })).rejects.toBe(httpError);
    const response = await mocks.errorHandler!({ next: async () => { throw new Error("unexpected"); } }) as Response;
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("This page didn't load");
  });
});
