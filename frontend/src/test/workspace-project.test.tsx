import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

describe("Workspace - Project Management", () => {
  const mockUser = {
    id: "u-101",
    email: "lead@barclays.com",
    full_name: "Lead Architect",
    role: "owner",
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("sprintsmith_access_token", "valid-user-token");
    vi.restoreAllMocks();
  });

  it("renders EmptyProjects screen when user has no projects", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Start with a project" })).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Create a project to organize requirements/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create your first project/i }),
    ).toBeInTheDocument();
  });

  it("opens create project modal and validates required project name", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create your first project/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create your first project/i }));

    expect(screen.getByRole("heading", { name: "Create a project" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^project name/i);
    const createBtn = screen.getByRole("button", { name: "Create project" });

    // When empty, submit button is disabled
    expect(createBtn).toBeDisabled();

    // Fill project name
    fireEvent.change(nameInput, { target: { value: "Mortgage Core" } });
    expect(createBtn).not.toBeDisabled();

    // Fill optional description
    const descInput = screen.getByLabelText(/description/i);
    fireEvent.change(descInput, { target: { value: "Core retail mortgage engine" } });

    // Cancel modal
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("heading", { name: "Create a project" })).not.toBeInTheDocument();
  });

  it("submits new project creation and updates workspace", async () => {
    const createdProject = {
      id: "p-new",
      name: "Payments Modernization",
      description: "ISO 20022 migration",
      created_at: "2026-10-01T12:00:00Z",
    };

    let projectCreated = false;
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") {
        return Promise.resolve(projectCreated ? [createdProject] : []);
      }
      if (path === `/api/v1/projects/${createdProject.id}/requirements`) return Promise.resolve([]);
      if (path === `/api/v1/projects/${createdProject.id}/artifacts`) return Promise.resolve([]);
      return Promise.resolve(createdProject);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create your first project/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create your first project/i }));

    fireEvent.change(screen.getByLabelText(/^project name/i), {
      target: { value: "Payments Modernization" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "ISO 20022 migration" },
    });

    projectCreated = true;
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        "/api/v1/projects",
        "valid-user-token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Payments Modernization",
            description: "ISO 20022 migration",
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Project created")).toBeInTheDocument();
      expect(screen.getAllByText("Payments Modernization").length).toBeGreaterThan(0);
    });
  });

  it("handles project creation error", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects" && (!init || init.method !== "POST")) {
        return Promise.resolve([]);
      }
      if (path === "/api/v1/projects" && init?.method === "POST") {
        return Promise.reject(new Error("Project quota reached"));
      }
      return Promise.resolve([]);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create your first project/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create your first project/i }));
    fireEvent.change(screen.getByLabelText(/^project name/i), {
      target: { value: "Too Many Projects" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(screen.getByText("Project quota reached")).toBeInTheDocument();
    });
  });

  it("switches between multiple projects in the sidebar", async () => {
    const proj1 = {
      id: "p-1",
      name: "Alpha Project",
      description: "First",
      created_at: "2026-09-01T00:00:00Z",
    };
    const proj2 = {
      id: "p-2",
      name: "Beta Project",
      description: "Second",
      created_at: "2026-09-02T00:00:00Z",
    };

    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([proj1, proj2]);
      if (path === "/api/v1/projects/p-1/requirements") {
        return Promise.resolve([
          {
            id: "r1",
            filename: "alpha-specs.md",
            doc_type: "requirement",
            chunks_indexed: 5,
            created_at: "2026-09-01T10:00:00Z",
          },
        ]);
      }
      if (path === "/api/v1/projects/p-1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p-2/requirements") {
        return Promise.resolve([
          {
            id: "r2",
            filename: "beta-specs.pdf",
            doc_type: "requirement",
            chunks_indexed: 8,
            created_at: "2026-09-02T10:00:00Z",
          },
        ]);
      }
      if (path === "/api/v1/projects/p-2/artifacts") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<Workspace />);

    // Initially loads p-1 (first project)
    await waitFor(() => {
      expect(screen.getAllByText("Alpha Project").length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Requirements/i })[0]);
    expect(await screen.findByText("alpha-specs.md")).toBeInTheDocument();

    // Click on Beta Project in the project options
    const betaBtn = screen.getByRole("button", { name: /Beta Project/i });
    fireEvent.click(betaBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith("/api/v1/projects/p-2/requirements", "valid-user-token");
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Requirements/i })[0]);
    expect(await screen.findByText("beta-specs.pdf")).toBeInTheDocument();
  });

  it("refreshes workspace when refresh button is clicked", async () => {
    const proj = {
      id: "p-1",
      name: "Live Project",
      description: "Test",
      created_at: "2026-09-01T00:00:00Z",
    };

    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([proj]);
      return Promise.resolve([]);
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getAllByText("Live Project").length).toBeGreaterThan(0);
    });

    const refreshBtn = screen.getByTitle("Refresh");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText("Workspace refreshed")).toBeInTheDocument();
    });
  });
});
