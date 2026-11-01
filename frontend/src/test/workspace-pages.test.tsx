import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

describe("Workspace - Pages, Forms, Ingest and Navigation", () => {
  const mockUser = {
    id: "u-1",
    email: "dev@barclays.com",
    full_name: "Frontend Engineer",
    role: "engineer",
  };

  const mockProject = {
    id: "proj-1",
    name: "Open Banking API",
    description: "PSD2 compliance and APIs",
    created_at: "2026-08-15T10:00:00Z",
  };

  const mockRequirements = [
    {
      id: "req-1",
      filename: "account-information.md",
      doc_type: "requirement",
      chunks_indexed: 12,
      created_at: "2026-08-16T11:00:00Z",
    },
    {
      id: "req-2",
      filename: "payment-initiation.txt",
      doc_type: "requirement",
      chunks_indexed: 8,
      created_at: "2026-08-17T14:30:00Z",
    },
  ];

  const mockArtifacts = [
    {
      id: "art-1",
      artifact_type: "user_story",
      title: "Consent Authorization Flow",
      content: {
        stories: [
          {
            id: "US-101",
            title: "Provide AISP Consent",
            story: "As a banking customer, I want to authorize AISP access.",
            priority: "P0",
          },
        ],
      },
      version: 1,
      created_at: "2026-08-18T09:00:00Z",
    },
    {
      id: "art-2",
      artifact_type: "api_spec",
      title: "PISP Endpoints Specification",
      content: {
        endpoints: [
          {
            method: "POST",
            path: "/v3.1/pisp/payments",
            description: "Initiate single payment",
          },
        ],
      },
      version: 2,
      created_at: "2026-08-19T16:00:00Z",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("sprintsmith_access_token", "test-token");
    vi.restoreAllMocks();
  });

  const setupDefaultMocks = () => {
    return vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([mockProject]);
      if (path === `/api/v1/projects/${mockProject.id}/requirements`) {
        return Promise.resolve(mockRequirements);
      }
      if (path === `/api/v1/projects/${mockProject.id}/artifacts`) {
        return Promise.resolve(mockArtifacts);
      }
      return Promise.resolve({});
    });
  };

  it("renders Overview page with metrics, pipeline, snapshot, and latest artifacts", async () => {
    setupDefaultMocks();
    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });

    // Check Metrics
    expect(screen.getAllByText("Requirements").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0); // 2 requirements, 2 artifacts
    expect(screen.getAllByText("Artifacts").length).toBeGreaterThan(0);
    expect(screen.getByText("Active")).toBeInTheDocument(); // Health active

    // Check pipeline steps
    expect(screen.getByText("Project pipeline")).toBeInTheDocument();
    expect(screen.getByText("Generation")).toBeInTheDocument();

    // Check snapshot
    expect(screen.getByText("At a glance")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    // Check recent artifacts table
    expect(screen.getByText("Consent Authorization Flow")).toBeInTheDocument();
    expect(screen.getByText("PISP Endpoints Specification")).toBeInTheDocument();
  });

  it("navigates to Requirements page, enforces form validation, and displays requirement inputs", async () => {
    setupDefaultMocks();
    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });

    // Click Requirements in sidebar
    const reqNavItem = screen.getAllByRole("button", { name: /Requirements/i })[0];
    fireEvent.click(reqNavItem);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add a requirement" })).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /Submit requirement/i });
    const textarea = screen.getByPlaceholderText(/Describe the product requirement/i);

    // Initial state: submit button is disabled because text is empty and no file
    expect(submitBtn).toBeDisabled();

    // Type less than 10 characters -> still disabled
    fireEvent.change(textarea, { target: { value: "Short" } });
    expect(submitBtn).toBeDisabled();

    // Type 10 or more characters -> enabled
    fireEvent.change(textarea, {
      target: { value: "Full user authentication requirement with biometric MFA." },
    });
    expect(submitBtn).not.toBeDisabled();

    // Check requirement table lists existing requirements
    expect(screen.getByText("account-information.md")).toBeInTheDocument();
    expect(screen.getByText("12 chunks")).toBeInTheDocument();
    expect(screen.getByText("payment-initiation.txt")).toBeInTheDocument();
    expect(screen.getByText("8 chunks")).toBeInTheDocument();
  });

  it("submits text requirement and handles job polling completion", async () => {
    const apiSpy = setupDefaultMocks();
    apiSpy.mockImplementation((path, token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([mockProject]);
      if (path === `/api/v1/projects/${mockProject.id}/requirements`) {
        return Promise.resolve(mockRequirements);
      }
      if (path === `/api/v1/projects/${mockProject.id}/artifacts`) {
        return Promise.resolve(mockArtifacts);
      }
      if (path === `/api/v1/projects/${mockProject.id}/requirements/text`) {
        return Promise.resolve({ ingest_job_id: "job-999" });
      }
      if (path === "/api/v1/ingest-jobs/job-999") {
        return Promise.resolve({ status: "done" });
      }
      return Promise.resolve({});
    });

    render(<Workspace />);

    // Navigate to requirements page
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Requirements/i })[0]);

    const textarea = screen.getByPlaceholderText(/Describe the product requirement/i);
    fireEvent.change(textarea, {
      target: { value: "Customer payment initiation API requires SCA confirmation." },
    });

    const submitBtn = screen.getByRole("button", { name: /Submit requirement/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/projects/${mockProject.id}/requirements/text`,
        "test-token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            content: "Customer payment initiation API requires SCA confirmation.",
            doc_type: "requirement",
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Requirement indexed and ready.")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("uploads a requirement document as multipart form data and polls indexing", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([mockProject]);
      if (path === `/api/v1/projects/${mockProject.id}/requirements` && init?.method === "POST") {
        return Promise.resolve({ ingest_job_id: "upload-job" });
      }
      if (path === `/api/v1/projects/${mockProject.id}/requirements`) return Promise.resolve([]);
      if (path === `/api/v1/projects/${mockProject.id}/artifacts`) return Promise.resolve([]);
      if (path === "/api/v1/ingest-jobs/upload-job") return Promise.resolve({ status: "done" });
      return Promise.resolve({});
    });
    const nativeSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, timeout === 1500 ? 0 : timeout, ...args)) as typeof window.setTimeout);
    render(<Workspace />);

    await screen.findByRole("heading", { name: "Project overview" });
    fireEvent.click(screen.getAllByRole("button", { name: /Requirements/i })[0]);
    const file = new File(["# Payment requirements"], "payment-requirements.md", { type: "text/markdown" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /Submit requirement/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Submit requirement/i }));

    await screen.findByText("Requirement indexed and ready.", {}, { timeout: 3000 });
    const uploadCall = apiSpy.mock.calls.find(([path, , init]) =>
      path === `/api/v1/projects/${mockProject.id}/requirements` && init?.method === "POST",
    );
    expect(uploadCall).toBeDefined();
    const body = uploadCall?.[2]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
    expect((body as FormData).get("doc_type")).toBe("requirement");
    expect(apiSpy).toHaveBeenCalledWith("/api/v1/ingest-jobs/upload-job", "test-token");
  });

  it("handles failed ingestion job polling", async () => {
    const apiSpy = setupDefaultMocks();
    apiSpy.mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(mockUser);
      if (path === "/api/v1/projects") return Promise.resolve([mockProject]);
      if (path === `/api/v1/projects/${mockProject.id}/requirements`) return Promise.resolve([]);
      if (path === `/api/v1/projects/${mockProject.id}/artifacts`) return Promise.resolve([]);
      if (path === `/api/v1/projects/${mockProject.id}/requirements/text`) {
        return Promise.resolve({ ingest_job_id: "job-fail" });
      }
      if (path === "/api/v1/ingest-jobs/job-fail") {
        return Promise.resolve({ status: "failed", error_message: "Docling parser syntax error" });
      }
      return Promise.resolve({});
    });

    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Requirements/i })[0]);

    const textarea = screen.getByPlaceholderText(/Describe the product requirement/i);
    fireEvent.change(textarea, {
      target: { value: "Requirement with corrupt formatting that will fail." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Submit requirement/i }));

    await waitFor(() => {
      expect(screen.getByText("Docling parser syntax error")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("filters artifacts by search term in Artifacts page", async () => {
    setupDefaultMocks();
    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });

    // Navigate to artifacts page
    fireEvent.click(screen.getByRole("button", { name: /^Artifacts/i }));

    await waitFor(() => {
      expect(screen.getByText("Consent Authorization Flow")).toBeInTheDocument();
      expect(screen.getByText("PISP Endpoints Specification")).toBeInTheDocument();
    });

    // Use top search bar to filter
    const searchInput = screen.getByPlaceholderText("Search workspace");
    fireEvent.change(searchInput, { target: { value: "PISP" } });

    expect(screen.getByText("PISP Endpoints Specification")).toBeInTheDocument();
    expect(screen.queryByText("Consent Authorization Flow")).not.toBeInTheDocument();

    // Search something with no matches
    fireEvent.change(searchInput, { target: { value: "NonExistentDeliverable" } });
    expect(screen.getByText("No artifacts yet")).toBeInTheDocument();
  });

  it("renders generated artifact and requirement entries in the Activity timeline", async () => {
    setupDefaultMocks();
    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });

    // Navigate to activity
    fireEvent.click(screen.getByRole("button", { name: /^Activity/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    });

    expect(screen.getByText("Generated user story")).toBeInTheDocument();
    expect(screen.getByText("Generated api spec")).toBeInTheDocument();
    expect(screen.getAllByText("Requirement ingested").length).toBe(2);
    const timeline = document.querySelector(".timeline");
    const firstEvent = timeline?.querySelector(".timeline-item");
    expect(firstEvent).toHaveTextContent("PISP Endpoints Specification");
  });

  it("dismisses toast notice on close button click", async () => {
    setupDefaultMocks();
    render(<Workspace />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    });

    // Click refresh to produce notice toast
    fireEvent.click(screen.getByTitle("Refresh"));

    await waitFor(() => {
      expect(screen.getByText("Workspace refreshed")).toBeInTheDocument();
    });

    // Find toast close button
    const toast = screen.getByText("Workspace refreshed").closest(".toast");
    const closeBtn = toast?.querySelector("button");
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);

    expect(screen.queryByText("Workspace refreshed")).not.toBeInTheDocument();
  });
});
