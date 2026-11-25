import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProtectedWorkspace } from "@/components/ProtectedWorkspace";

const { mockNavigate, mockRoute } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRoute: { pathname: "/" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: mockRoute }),
}));

vi.mock("@/screens/workspace", () => ({
  Workspace: () => <div>Authenticated workspace</div>,
}));

describe("ProtectedWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
    mockRoute.pathname = "/";
  });

  it("redirects unauthenticated users from protected routes to login", async () => {
    mockRoute.pathname = "/overview";

    render(<ProtectedWorkspace />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(screen.queryByText("Authenticated workspace")).not.toBeInTheDocument();
  });

  it("redirects users with a saved token from login to the dashboard", async () => {
    localStorage.setItem("sprintsmith_access_token", "valid-token");
    mockRoute.pathname = "/login";

    render(<ProtectedWorkspace />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(screen.queryByText("Authenticated workspace")).not.toBeInTheDocument();
  });

  it("allows users with a saved token to access the dashboard", async () => {
    localStorage.setItem("sprintsmith_access_token", "valid-token");

    render(<ProtectedWorkspace />);

    expect(await screen.findByText("Authenticated workspace")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
