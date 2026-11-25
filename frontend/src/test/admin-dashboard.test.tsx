import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AdminDashboard } from "@/components/AdminDashboard";
import * as backendApi from "@/lib/backend-api";

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders admin summary, users, and projects", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockResolvedValue({
      summary: { users: 2, projects: 1, collaborators: 3, admins: 1 },
      users: [
        {
          id: "u1",
          full_name: "Ada Admin",
          email: "ada@example.com",
          role: "admin",
          is_active: true,
          created_at: "2026-01-15T10:00:00Z",
        },
        {
          id: "u2",
          full_name: "Bob Member",
          email: "bob@example.com",
          role: "member",
          is_active: false,
          created_at: "2026-01-16T10:00:00Z",
        },
      ],
      projects: [
        {
          id: "p1",
          name: "Core Platform",
          owner_name: "Ada Admin",
          owner_email: "ada@example.com",
          collaborators: 3,
          created_at: "2026-01-15T12:00:00Z",
        },
      ],
    });

    render(<AdminDashboard token="admin-jwt" />);

    expect(screen.getByText("Loading users…")).toBeInTheDocument();
    expect(screen.getByText("Loading projects…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Ada Admin").length).toBeGreaterThan(0);
    });

    expect(apiSpy).toHaveBeenCalledWith("/api/v1/admin/overview", "admin-jwt");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Core Platform")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("renders empty states when users and projects are empty", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue({
      summary: { users: 0, projects: 0, collaborators: 0, admins: 0 },
      users: [],
      projects: [],
    });

    render(<AdminDashboard token="admin-jwt" />);

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
    expect(screen.getByText("No projects found.")).toBeInTheDocument();
  });

  it("displays an error banner when loading fails with Error or non-Error", async () => {
    const apiSpy = vi
      .spyOn(backendApi, "api")
      .mockRejectedValueOnce(new Error("Administrator role required"))
      .mockRejectedValueOnce("unexpected");

    render(<AdminDashboard token="user-jwt" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Administrator role required");

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not load the admin overview.");
    });
    expect(apiSpy).toHaveBeenCalledTimes(2);
  });
});

