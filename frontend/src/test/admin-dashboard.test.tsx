import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminDashboard } from "@/components/AdminDashboard";
import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

const adminOverview = {
  summary: { users: 6, projects: 1, collaborators: 3, admins: 6 },
  users: [{ id: "u1", full_name: "Sayali", email: "sayali@sprintsmith.local", role: "admin", is_active: true, created_at: "2026-11-26T00:00:00Z" }],
  projects: [{ id: "p1", name: "Payments", owner_name: "Sayali", owner_email: "sayali@sprintsmith.local", collaborators: 3, created_at: "2026-11-26T00:00:00Z" }],
};

describe("Admin dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows platform totals, users, project owners, and collaborators", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue(adminOverview);
    render(<AdminDashboard token="admin-token" />);

    expect(await screen.findByRole("heading", { name: "Admin panel" })).toBeInTheDocument();
    expect(screen.getByText("Platform users")).toBeInTheDocument();
    expect(screen.getAllByText("6", { selector: "strong" })).toHaveLength(2);
    expect(screen.getAllByText("sayali@sprintsmith.local")).toHaveLength(2);
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "td" })).toBeInTheDocument();
  });

  it("reports an overview request failure", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Admin access required"));
    render(<AdminDashboard token="user-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Admin access required");
  });

  it("shows admin-only navigation for an existing admin session", async () => {
    localStorage.setItem("sprintsmith_access_token", "admin-token");
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation(async (path, _token, init) => {
      if (path === "/api/v1/auth/me") return { id: "u1", email: "sayali@sprintsmith.local", full_name: "Sayali", role: "admin" };
      if (path === "/api/v1/projects") return [];
      if (path === "/api/v1/admin/overview") return adminOverview;
      if (path.startsWith("/api/v1/observability/langfuse")) return {
        configured: false, langfuse_url: "https://cloud.langfuse.com", days: 7, observations: [], truncated: false,
      };
      return {};
    });

    render(<Workspace />);
    await screen.findByRole("button", { name: /Admin panel/i }, { timeout: 5000 });
    expect(screen.getByRole("button", { name: /AI Monitoring/i })).toBeInTheDocument();
    expect(apiSpy).toHaveBeenCalledWith("/api/v1/auth/me", "admin-token");
  });

  it("maps an admin username to its provisioned email during login", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation(async (path) => {
      if (path === "/api/v1/auth/login") return { access_token: "admin-token" };
      if (path === "/api/v1/auth/me") return { id: "u1", email: "sayali@sprintsmith.local", full_name: "Sayali", role: "admin" };
      if (path === "/api/v1/projects") return [];
      return {};
    });

    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: "Admin login" }));
    fireEvent.change(screen.getByLabelText("Admin username or email"), { target: { value: "Sayali" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-admin-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(apiSpy).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      undefined,
      expect.objectContaining({ body: JSON.stringify({ email: "sayali@sprintsmith.local", password: "test-admin-password" }) }),
    ));
    expect(await screen.findByText("Sayali")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admin panel/i })).toBeInTheDocument();
  });
});
