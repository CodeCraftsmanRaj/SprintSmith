import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { Route as rootRoute } from "@/routes/__root";
import { Route as indexRoute } from "@/routes/index";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches every registered page route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    for (const path of ["/", "/audit", "/login", "/overview", "/plan", "/prompts", "/synthesize", "/verify"]) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, `route ${path}`).not.toBe(rootRouteId);
    }
  });

  it("publishes SprintSmith browser metadata and custom favicon", () => {
    const rootHead = rootRoute.options.head?.({} as never);
    const indexHead = indexRoute.options.head?.({} as never);
    expect(rootHead?.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }),
    ]));
    expect(indexHead?.meta).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "SprintSmith · Project workspace" }),
    ]));
  });
});
