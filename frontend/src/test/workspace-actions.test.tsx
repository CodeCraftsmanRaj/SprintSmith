import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

const tokenKey = "sprintsmith_access_token";
const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role: "member" };
const adminUser = { ...user, role: "admin" };
const project1 = { id: "p1", name: "Payments", description: "", created_at: "2026-10-01T00:00:00Z" };
const project2 = { id: "p2", name: "Loans", description: "", created_at: "2026-10-02T00:00:00Z" };
const requirement = {
  id: "r1",
  project_id: "p1",
  filename: "brief.md",
  doc_type: "requirement",
  chunks_indexed: 3,
  created_at: "2026-10-03T00:00:00Z",
};
const story = {
  id: "a1",
  artifact_type: "user_story",
  title: "Transfer funds",
  content: { stories: [{ id: "US-1", title: "Make a transfer", story: "As a customer, I can transfer funds." }] },
  version: 1,
  created_at: "2026-10-04T00:00:00Z",
};

function monitoringResponse(projectId: string) {
  return {
    available: true,
    dashboard_url: `https://grafana.test/d/${projectId}`,
    message: "",
  };
}

function baseMock(path: string): Promise<unknown> | undefined {
  if (path === "/api/v1/auth/me") return Promise.resolve(user);
  if (path === "/api/v1/projects") return Promise.resolve([project1]);
  if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([]);
  if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
  if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
  if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "owner" });
  return undefined;
}

/** Resolve the component's 1500 ms polling delay immediately without affecting waitFor. */
function fastForwardPolling() {
  const realSetTimeout = window.setTimeout.bind(window);
  return vi.spyOn(window, "setTimeout").mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => {
    if (timeout === 1500 && typeof handler === "function") {
      (handler as (...values: unknown[]) => void)(...args);
      return 0;
    }
    return realSetTimeout(handler, timeout, ...args);
  }) as unknown as typeof window.setTimeout);
}

describe("Workspace actions and navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    localStorage.setItem(tokenKey, "test-token");
    vi.restoreAllMocks();
  });

  it("loads workspace data, falls back on dashboard errors, refreshes, dismisses toasts, and switches projects", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1, project2]);
      if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([requirement]);
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([story]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.reject(new Error("Grafana down"));
      if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "owner" });
      if (path === "/api/v1/projects/p2/requirements") return Promise.resolve([]);
      if (path === "/api/v1/projects/p2/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p2/monitoring-dashboard") return Promise.resolve(monitoringResponse("p2"));
      if (path === "/api/v1/projects/p2/members") return Promise.resolve({ current_role: "viewer" });
      return Promise.resolve({});
    });

    render(<Workspace />);

    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    expect(
      screen.getByText("Grafana dashboard could not be loaded. Refresh the workspace to try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Pipeline operational")).toBeInTheDocument();
    expect(screen.getByText("Workspace is processing normally")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Refresh"));
    expect(await screen.findByText("Workspace refreshed")).toBeInTheDocument();

    const toast = screen.getByText("Workspace refreshed").parentElement as HTMLElement;
    fireEvent.click(within(toast).getByRole("button"));
    await waitFor(() => expect(screen.queryByText("Workspace refreshed")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Loans" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/v1/projects/p2/requirements", "test-token"),
    );
    expect(
      await screen.findByRole("link", {
        name: "Open Grafana dashboard for Loans in a new tab",
      }),
    ).toHaveAttribute("href", "https://grafana.test/d/p2");
    expect(screen.getByText("Awaiting first input")).toBeInTheDocument();
  });

  it("creates the first project from the empty state and closes the modal with cancel or backdrop", async () => {
    const created = { id: "p3", name: "New project", description: "Fresh", created_at: "2026-11-01T00:00:00Z" };
    let projects: unknown[] = [];
    const api = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects" && init?.method === "POST") {
        projects = [created];
        return Promise.resolve(created);
      }
      if (path === "/api/v1/projects") return Promise.resolve(projects);
      if (path.endsWith("/requirements") || path.endsWith("/artifacts")) return Promise.resolve([]);
      if (path.endsWith("/monitoring-dashboard")) {
        return Promise.resolve({ available: false, dashboard_url: null, message: "Select a project to view its monitoring dashboard." });
      }
      if (path.endsWith("/members")) return Promise.resolve({ current_role: "owner" });
      return Promise.resolve({});
    });

    render(<Workspace />);
    expect(await screen.findByText("Start with a project")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create your first project" }));
    expect(screen.getByRole("heading", { name: "Create a project" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Create a project" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Select a project/ }));
    fireEvent.mouseDown(document.querySelector(".modal-backdrop") as HTMLElement);
    expect(screen.queryByRole("heading", { name: "Create a project" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Select a project/ }));
    fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: "New project" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("Project created")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create a project" })).not.toBeInTheDocument();
    expect(screen.getAllByText("New project").length).toBeGreaterThan(0);
    expect(api).toHaveBeenCalledWith(
      "/api/v1/projects",
      "test-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New project", description: "Fresh" }),
      }),
    );
  });

  it("reports a friendly message when project creation rejects a non-Error value", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects" && init?.method === "POST") return Promise.reject("nope");
      if (path === "/api/v1/projects") return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Create your first project" }));
    fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: "Broken project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("Could not create project")).toBeInTheDocument();
  });

  it("submits pasted requirements and polls until indexing completes", async () => {
    const polling = fastForwardPolling();
    const api = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/requirements" && init?.method !== "POST") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/requirements/text" && init?.method === "POST") {
        return Promise.resolve({ ingest_job_id: "job-text" });
      }
      if (path === "/api/v1/ingest-jobs/job-text") return Promise.resolve({ status: "done" });
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
      if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "owner" });
      return Promise.resolve({});
    });

    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /^Requirements/ }));
    fireEvent.change(screen.getByLabelText(/Paste requirement text/), {
      target: { value: "A detailed requirement description" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit requirement" }));

    expect(await screen.findByText("Requirement indexed and ready.")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      "/api/v1/projects/p1/requirements/text",
      "test-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "A detailed requirement description", doc_type: "requirement" }),
      }),
    );
    expect(api).toHaveBeenCalledWith("/api/v1/ingest-jobs/job-text", "test-token");
    expect(polling).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
  });

  it("uploads requirement documents and surfaces indexing failures", async () => {
    fastForwardPolling();
    const api = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/requirements" && init?.method !== "POST") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/requirements" && init?.method === "POST") {
        return Promise.resolve({ ingest_job_id: "job-file" });
      }
      if (path === "/api/v1/ingest-jobs/job-file") {
        return Promise.resolve({ status: "failed", error_message: "Unsupported document" });
      }
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
      if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "owner" });
      return Promise.resolve({});
    });

    const { container } = render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /^Requirements/ }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["requirement"], "requirements.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit requirement" }));

    expect(await screen.findByText("Unsupported document")).toBeInTheDocument();
    const upload = api.mock.calls.find(
      ([path, , init]) => path === "/api/v1/projects/p1/requirements" && init?.method === "POST",
    );
    expect(upload?.[2]?.body).toBeInstanceOf(FormData);
  });

  it("reports requirements that are still indexing after the polling window", async () => {
    fastForwardPolling();
    vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/requirements" && init?.method !== "POST") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/requirements/text" && init?.method === "POST") {
        return Promise.resolve({ ingest_job_id: "job-slow" });
      }
      if (path === "/api/v1/ingest-jobs/job-slow") return Promise.resolve({ status: "processing" });
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
      if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "owner" });
      return Promise.resolve({});
    });

    render(<Workspace />);
    fireEvent.click(await screen.findByRole("button", { name: /^Requirements/ }));
    fireEvent.change(screen.getByLabelText(/Paste requirement text/), {
      target: { value: "Requirement that never finishes indexing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit requirement" }));

    expect(
      await screen.findByText(
        "Requirement submitted. Indexing is still in progress; refresh the workspace shortly.",
      ),
    ).toBeInTheDocument();
  });

  it("navigates artifacts, activity, and team pages and copies primitive artifact content", async () => {
    const primitive = {
      id: "a2",
      artifact_type: "release_brief",
      title: "Plain artifact",
      content: "plain text body",
      version: 1,
      created_at: "2026-10-05T00:00:00Z",
    };
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([primitive]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
      if (path === "/api/v1/projects/p1/members") {
        return Promise.resolve({
          current_role: "owner",
          can_manage_members: true,
          can_manage_admins: true,
          members: [{ user_id: "u1", email: "qa@example.com", full_name: "QA User", role: "owner", joined_at: "2026-10-01", is_current_user: true }],
          invitations: [],
        });
      }
      if (path.includes("/activity")) {
        return Promise.resolve([
          { id: "e1", action: "project.create", resource_type: "project", details: {}, created_at: "2026-10-01T00:00:00Z" },
        ]);
      }
      return Promise.resolve({});
    });

    render(<Workspace />);
    await screen.findByRole("heading", { name: "Project overview" });

    fireEvent.click(screen.getByRole("button", { name: /View all/ }));
    expect(await screen.findByRole("heading", { name: "Generated artifacts" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Plain artifact"));
    expect(screen.getByRole("heading", { name: "Plain artifact" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("plain text body")));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Created the project")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(await screen.findByRole("heading", { name: /Project team/, level: 1 })).toBeInTheDocument();
  });

  it("shows the AI monitoring page for administrators", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(adminUser);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/monitoring-dashboard") return Promise.resolve(monitoringResponse("p1"));
      if (path === "/api/v1/projects/p1/members") return Promise.resolve({ current_role: "admin" });
      if (path.includes("/observability/langfuse")) {
        return Promise.resolve({
          configured: true,
          langfuse_url: "https://langfuse.test",
          days: 7,
          observations: [],
          truncated: false,
        });
      }
      return Promise.resolve({});
    });

    render(<Workspace />);
    await screen.findByRole("heading", { name: "Project overview" });
    fireEvent.click(screen.getByRole("button", { name: "AI Monitoring" }));

    expect(await screen.findByRole("heading", { name: "Langfuse monitoring" })).toBeInTheDocument();
    expect(screen.queryByText("PROJECT CONSOLE")).not.toBeInTheDocument();
  });

  it("hides AI monitoring from non-admin members", async () => {
    vi.spyOn(backendApi, "api").mockImplementation((path) => baseMock(path) ?? Promise.resolve({}));
    render(<Workspace />);
    await screen.findByRole("heading", { name: "Project overview" });
    expect(screen.queryByRole("button", { name: "AI Monitoring" })).not.toBeInTheDocument();
  });

  it("surfaces refresh and project-switch failures as error toasts", async () => {
    let failure: "none" | "refresh" | "switch" = "none";
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1, project2]);
      if (path === "/api/v1/projects/p1/requirements" && failure === "refresh") {
        return Promise.reject(new Error("Refresh exploded"));
      }
      if (path === "/api/v1/projects/p2/requirements" && failure === "switch") {
        return Promise.reject(new Error("Switch failed"));
      }
      return baseMock(path) ?? Promise.resolve({});
    });

    render(<Workspace />);
    await screen.findByRole("heading", { name: "Project overview" });

    failure = "refresh";
    fireEvent.click(screen.getByTitle("Refresh"));
    expect(await screen.findByText("Refresh exploded")).toBeInTheDocument();

    const toast = screen.getByText("Refresh exploded").parentElement as HTMLElement;
    fireEvent.click(within(toast).getByRole("button"));
    await waitFor(() => expect(screen.queryByText("Refresh exploded")).not.toBeInTheDocument());

    failure = "switch";
    fireEvent.click(screen.getByRole("button", { name: "Loans" }));
    expect(await screen.findByText("Switch failed")).toBeInTheDocument();
  });

  it("generates an artifact through the modal and opens the result", async () => {
    const generated = {
      id: "a3",
      artifact_type: "user_story",
      title: "Generated story",
      content: { stories: [] },
      version: 1,
      created_at: "2026-10-06T00:00:00Z",
    };
    vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project1]);
      if (path === "/api/v1/projects/p1/generate" && init?.method === "POST") {
        return Promise.resolve(generated);
      }
      return baseMock(path) ?? Promise.resolve({});
    });

    render(<Workspace />);
    await screen.findByRole("heading", { name: "Project overview" });
    fireEvent.click(screen.getByRole("button", { name: /^Requirements/ }));
    fireEvent.click(screen.getByRole("button", { name: /Generate Artifact/ }));

    const dialog = await screen.findByRole("dialog", { name: "Generate an artifact" });
    fireEvent.click(within(dialog).getByRole("button", { name: /User Story/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Use Demo Data" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Preview prompts/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Generate artifact/i }));

    expect(await screen.findByText("1 artifacts generated successfully")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Generated story" }),
    ).toBeInTheDocument();
  });
});
