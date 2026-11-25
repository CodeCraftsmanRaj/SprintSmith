import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockNavigate = vi.fn();
let mockPathname = "/";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mockPathname } }),
}));

vi.mock("@/screens/workspace", () => ({
  Workspace: ({ onTokenChange }: { onTokenChange?: (token: string) => void }) => (
    <div data-testid="workspace-stub">
      <button type="button" onClick={() => onTokenChange?.("")}>
        Clear token
      </button>
    </div>
  ),
}));

import { ProtectedWorkspace } from "@/components/ProtectedWorkspace";

describe("ProtectedWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    mockNavigate.mockReset();
    mockPathname = "/";
  });

  it("redirects unauthenticated users on protected routes to /login and saves pending invite", async () => {
    window.history.replaceState({}, "", "/?invite=inv-token-42");
    mockPathname = "/";

    render(<ProtectedWorkspace />);

    expect(screen.getByRole("status", { name: "Checking authentication" })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(sessionStorage.getItem("sprintsmith_pending_invitation")).toBe("inv-token-42");
    expect(screen.queryByTestId("workspace-stub")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users without invite query param to /login without touching sessionStorage", async () => {
    mockPathname = "/overview";

    render(<ProtectedWorkspace />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(sessionStorage.getItem("sprintsmith_pending_invitation")).toBeNull();
  });

  it("renders Workspace on /login when unauthenticated", async () => {
    mockPathname = "/login";

    render(<ProtectedWorkspace />);

    expect(await screen.findByTestId("workspace-stub")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects authenticated users away from /login to /", async () => {
    localStorage.setItem("sprintsmith_access_token", "valid-jwt");
    mockPathname = "/login";

    render(<ProtectedWorkspace />);

    expect(screen.getByRole("status", { name: "Checking authentication" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/", replace: true });
    });
    expect(screen.queryByTestId("workspace-stub")).not.toBeInTheDocument();
  });

  it("renders Workspace when authenticated and reacts to onTokenChange", async () => {
    localStorage.setItem("sprintsmith_access_token", "valid-jwt");
    mockPathname = "/";

    render(<ProtectedWorkspace />);

    const workspace = await screen.findByTestId("workspace-stub");
    expect(workspace).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear token" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
  });
});

