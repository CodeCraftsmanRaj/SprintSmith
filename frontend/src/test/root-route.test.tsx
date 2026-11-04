import type { ComponentType, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  reportError: vi.fn(),
  queryClient: null as unknown,
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");

  return {
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
      React.createElement("a", { href: to, ...props }, children),
    createRootRouteWithContext: () => (options: Record<string, unknown>) => ({
      options,
      useRouteContext: () => ({ queryClient: mocks.queryClient }),
    }),
    useRouter: () => ({ invalidate: mocks.invalidate }),
    HeadContent: () => React.createElement("meta", { "data-testid": "head-content" }),
    Scripts: () => React.createElement("script", { "data-testid": "scripts" }),
    Outlet: () => React.createElement("div", { "data-testid": "outlet" }, "Nested route"),
  };
});

vi.mock("@/lib/lovable-error-reporting", () => ({
  reportLovableError: mocks.reportError,
}));

import { Route } from "@/routes/__root";

type RootOptions = {
  head: () => { meta: Array<Record<string, string>>; links: Array<Record<string, string>> };
  shellComponent: ComponentType<{ children: ReactNode }>;
  component: ComponentType;
  notFoundComponent: ComponentType;
  errorComponent: ComponentType<{ error: Error; reset: () => void }>;
};

const options = Route.options as unknown as RootOptions;

describe("root route", () => {
  beforeEach(() => {
    mocks.invalidate.mockReset().mockResolvedValue(undefined);
    mocks.reportError.mockReset();
    mocks.queryClient = new QueryClient();
  });

  it("provides document metadata and a complete HTML shell", () => {
    const head = options.head();
    expect(head.meta).toEqual([
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ]);
    expect(head.links).toHaveLength(3);

    const html = renderToStaticMarkup(
      <options.shellComponent>
        <main>Application content</main>
      </options.shellComponent>,
    );
    expect(html).toContain('<html lang="en" class="dark">');
    expect(html).toContain("Application content");
    expect(html).toContain("data-testid=\"head-content\"");
    expect(html).toContain("data-testid=\"scripts\"");
  });

  it("renders a not-found page with a home link", () => {
    const html = renderToStaticMarkup(<options.notFoundComponent />);

    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).toContain("Go home");
  });

  it("renders nested routes inside the query client provider", () => {
    render(<options.component />);

    expect(screen.getByTestId("outlet")).toHaveTextContent("Nested route");
  });

  it("reports boundary errors and retries after invalidating the router", async () => {
    const error = new Error("route failed");
    const reset = vi.fn();
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<options.errorComponent error={error} reset={reset} />);
    expect(screen.getByText("This page didn't load")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.reportError).toHaveBeenCalledWith(error, {
        boundary: "tanstack_root_error_component",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(mocks.invalidate).toHaveBeenCalledOnce();
      expect(reset).toHaveBeenCalledOnce();
    });
    logError.mockRestore();
  });
});
