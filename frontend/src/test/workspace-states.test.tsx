import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role: "member" };
const project = {
  id: "p1",
  name: "Payments",
  description: "",
  created_at: "2026-10-01T00:00:00Z",
};
const story = {
  id: "a1",
  artifact_type: "user_story",
  title: "Transfer funds",
  content: { stories: [{ id: "US-1", title: "Make a transfer", story: "As a customer, I can transfer funds.", priority: "P1" }] },
  version: 1,
  created_at: "2026-10-02T00:00:00Z",
};

function mockWorkspace(artifacts: unknown[] = []) {
  return vi.spyOn(backendApi, "api").mockImplementation((path) => {
    if (path === "/api/v1/auth/me") return Promise.resolve(user);
    if (path === "/api/v1/projects") return Promise.resolve([project]);
    if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([]);
    if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve(artifacts);
    return Promise.resolve({});
  });
}

describe("Workspace loading and artifact details", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("sprintsmith_access_token", "test-token");
    vi.restoreAllMocks();
  });

  it("reports initial workspace API failures in a toast", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Workspace service unavailable"));
    render(<Workspace />);

    expect(await screen.findByText("Workspace service unavailable")).toBeInTheDocument();
  });

  it("reports refresh failures without losing the loaded workspace", async () => {
    const apiSpy = mockWorkspace();
    render(<Workspace />);

    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    apiSpy.mockRejectedValue(new Error("Refresh unavailable"));
    fireEvent.click(screen.getByTitle("Refresh"));

    expect(await screen.findByText("Refresh unavailable")).toBeInTheDocument();
  });

  it("shows the artifact document and toggles to its source JSON", async () => {
    mockWorkspace([story]);
    render(<Workspace />);

    fireEvent.click(await screen.findByText("Transfer funds"));
    expect(screen.getByRole("heading", { name: "Transfer funds" })).toBeInTheDocument();
    expect(screen.getByText("Make a transfer")).toBeInTheDocument();
    expect(screen.getByText("As a customer, I can transfer funds.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View JSON" }));
    expect(screen.getByText("Source JSON")).toBeInTheDocument();
    expect(screen.getByText(/"US-1"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Formatted view" }));
    expect(screen.getByText("Formatted document")).toBeInTheDocument();
  });

  it("renders acceptance criteria, test cases, sprint plans, architecture, API specs, and generic artifacts", async () => {
    const artifacts = [
      {
        ...story,
        id: "criteria",
        title: "Payment criteria",
        artifact_type: "acceptance_criteria",
        content: {
          user_story_title: "Transfer funds",
          criteria: [{
            case_type: "positive",
            given: "I am signed in",
            when: "I submit a transfer",
            then: "The transfer is recorded",
          }],
        },
      },
      {
        ...story,
        id: "test-case",
        title: "Payment test",
        artifact_type: "test_case",
        content: {
          cases: [{
            id: "TC-1",
            category: "integration",
            title: "Submit a transfer",
            steps: ["Enter amount", "Confirm transfer"],
            expected_result: "Receipt is shown",
            traceability: "REQ-1",
          }],
        },
      },
      {
        ...story,
        id: "sprint-plan",
        title: "Payment sprint",
        artifact_type: "sprint_plan",
        content: {
          assumed_velocity_points_per_sprint: 20,
          items: [{
            story_title: "Build transfer flow",
            sprint: "1",
            story_points: 5,
            effort_estimate_hours: 8,
            dependencies: ["Identity"],
          }],
          critical_path: [],
        },
      },
      {
        ...story,
        id: "architecture",
        title: "Payment architecture",
        artifact_type: "architecture",
        content: {
          pattern: "Event-driven",
          rationale: "Keep payment processing resilient.",
          technology_recommendations: ["Kafka"],
          components: [
            { name: "Gateway", responsibility: "Accept requests", technology: "API" },
            { name: "Ledger", responsibility: "Record balances", technology: "Postgres" },
          ],
          data_flow: "Gateway -> Ledger then Database.",
          security_considerations: ["Encrypt the ledger"],
        },
      },
      {
        ...story,
        id: "api-spec",
        title: "Payment API",
        artifact_type: "api_spec",
        content: {
          endpoints: [{
            method: "post",
            path: "/payments",
            description: "Create a payment",
            request_schema: [{ name: "amount", type: "number", required: true, description: "Minor units" }],
            response_schema: [{ name: "id", type: "string" }],
            error_codes: [{ code: "400", reason: "Invalid amount" }],
          }],
        },
      },
      {
        ...story,
        id: "generic",
        title: "Generic artifact",
        artifact_type: "custom",
        content: {
          labels: ["alpha", 2],
          items: [{ name: "Access token" }],
          settings: { retryCount: 3 },
          omitted: null,
        },
      },
    ];
    mockWorkspace(artifacts);
    render(<Workspace />);

    const artifactNav = await screen.findAllByRole("button", { name: /Artifacts/i });
    fireEvent.click(artifactNav[0]!);

    for (const [title, expected] of [
      ["Payment criteria", "The transfer is recorded"],
      ["Payment test", "Receipt is shown"],
      ["Payment sprint", "No critical path identified"],
      ["Payment architecture", "Encrypt the ledger"],
      ["Payment API", "Invalid amount"],
      ["Generic artifact", "Access token"],
    ]) {
      fireEvent.click(await screen.findByText(title));
      expect(await screen.findByText(expected)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    }

    fireEvent.click(screen.getByText("Payment architecture"));
    expect(await screen.findByText("Request journey")).toBeInTheDocument();
    expect(screen.getAllByText("Gateway").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByText("Payment API"));
    expect(await screen.findByText("Request schema")).toBeInTheDocument();
    expect(screen.getByText("Minor units")).toBeInTheDocument();
    expect(screen.getByText("400")).toBeInTheDocument();
  });

  it("sends generated artifact inputs to the project API and opens the result", async () => {
    const generated = {
      ...story,
      id: "a2",
      title: "Customer transfer story",
      content: { stories: [{ id: "US-2", title: "Submit a transfer", story: "As a customer, I can submit a transfer." }] },
    };
    const apiSpy = mockWorkspace().mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project]);
      if (path === "/api/v1/projects/p1/requirements") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/artifacts") return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/generate" && init?.method === "POST") return Promise.resolve(generated);
      return Promise.resolve({});
    });
    render(<Workspace />);

    fireEvent.click(await screen.findByRole("button", { name: /Requirements/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate Artifact/i }));
    fireEvent.click(screen.getByRole("button", { name: /user story/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/Feature \/ Initiative Title/i), { target: { value: "Customer transfer" } });
    fireEvent.change(screen.getByLabelText(/Actor \/ Role/i), { target: { value: "Customer" } });
    fireEvent.change(screen.getByLabelText(/^Goal/i), { target: { value: "Submit a transfer" } });
    fireEvent.change(screen.getByLabelText(/Business Benefit/i), { target: { value: "Move money quickly" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "P1 - High" } });
    fireEvent.click(screen.getByRole("button", { name: /preview prompt/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /generate artifact/i }));

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        "/api/v1/projects/p1/generate",
        "test-token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"artifact_type":"user_story"'),
        }),
      );
      expect(screen.getByRole("heading", { name: "Customer transfer story" })).toBeInTheDocument();
    });
  });

  it("navigates workspace actions and opens the project creation dialog", async () => {
    mockWorkspace();
    const { container } = render(<Workspace />);

    expect(await screen.findByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    fireEvent.click(container.querySelector(".project-switcher")!);
    expect(await screen.findByRole("heading", { name: "Create a project" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
    expect(await screen.findByText("Paste requirement text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "View requirements" }));
    expect(await screen.findByText("Paste requirement text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(await screen.findByRole("button", { name: /View all/i }));
    expect(await screen.findByRole("heading", { name: "Generated artifacts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New generation" }));
    expect(await screen.findByText("Paste requirement text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate Artifact/i }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  });

  it("reports project loading and artifact generation failures", async () => {
    const secondProject = { ...project, id: "p2", name: "Secondary" };
    vi.spyOn(backendApi, "api").mockImplementation((path) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project, secondProject]);
      if (path === "/api/v1/projects/p2/requirements") return Promise.reject(new Error("Project could not load"));
      if (path.endsWith("/requirements") || path.endsWith("/artifacts")) return Promise.resolve([]);
      return Promise.resolve({});
    });
    const { unmount } = render(<Workspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Secondary" }));
    expect(await screen.findByText("Project could not load")).toBeInTheDocument();
    unmount();

    const apiSpy = mockWorkspace().mockImplementation((path, _token, init) => {
      if (path === "/api/v1/auth/me") return Promise.resolve(user);
      if (path === "/api/v1/projects") return Promise.resolve([project]);
      if (path.endsWith("/requirements") || path.endsWith("/artifacts")) return Promise.resolve([]);
      if (path === "/api/v1/projects/p1/generate" && init?.method === "POST") {
        return Promise.reject(new Error("Generation failed"));
      }
      return Promise.resolve({});
    });
    render(<Workspace />);

    fireEvent.click(await screen.findByRole("button", { name: /Requirements/i }));
    fireEvent.click(screen.getByRole("button", { name: /Generate Artifact/i }));
    fireEvent.click(screen.getByRole("button", { name: /user story/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/Feature \/ Initiative Title/i), { target: { value: "Transfer" } });
    fireEvent.change(screen.getByLabelText(/Actor \/ Role/i), { target: { value: "Customer" } });
    fireEvent.change(screen.getByLabelText(/^Goal/i), { target: { value: "Move funds" } });
    fireEvent.change(screen.getByLabelText(/Business Benefit/i), { target: { value: "Save time" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "P1 - High" } });
    fireEvent.click(screen.getByRole("button", { name: /preview prompt/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /generate artifact/i }));

    expect(await screen.findAllByText("Generation failed")).not.toHaveLength(0);
    expect(apiSpy).toHaveBeenCalledWith(
      "/api/v1/projects/p1/generate",
      "test-token",
      expect.objectContaining({ method: "POST" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  });

  it("keeps the artifact dialog closable after exporting controls are available", async () => {
    const createObjectUrl = vi.fn(() => "blob:test-artifact");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockWorkspace([
      story,
      { ...story, id: "plain", title: "Plain content", content: "Plain artifact content" },
    ]);
    render(<Workspace />);

    fireEvent.click(await screen.findByText("Transfer funds"));
    fireEvent.click(screen.getByRole("button", { name: "Export .md" }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-artifact");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Transfer funds" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByText("Plain content"));
    fireEvent.click(screen.getByRole("button", { name: "Export .md" }));
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
  });
});
