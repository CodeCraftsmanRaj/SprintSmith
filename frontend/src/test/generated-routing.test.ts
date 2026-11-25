import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";
import { routeTree } from "@/routeTree.gen";
import { Constants } from "@/integrations/supabase/types";

describe("router setup and generated route metadata", () => {
  it("builds a router with all generated pages", () => {
    const router = getRouter();
    for (const path of ["/", "/audit", "/login", "/overview", "/plan", "/prompts", "/synthesize", "/verify"]) {
      expect(router.matchRoutes(path).length).toBeGreaterThan(0);
    }
    expect(routeTree).toBeDefined();
  });

  it("exposes the generated Supabase enum constants", () => {
    expect(Constants.public.Enums).toEqual({});
  });
});
