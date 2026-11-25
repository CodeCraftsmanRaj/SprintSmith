import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Workspace } from "@/screens/workspace";
import * as backendApi from "@/lib/backend-api";

const user = { id: "u1", email: "qa@example.com", full_name: "QA User", role: "member" };
const project = { id: "p1", name: "Payments", description: "", created_at: "2026-10-01T00:00:00Z" };
const base = { id: "artifact", version: 1, created_at: "2026-10-02T00:00:00Z" };

function openArtifact(artifact: Record<string, unknown>) {
  localStorage.setItem("sprintsmith_access_token", "token");
  vi.spyOn(backendApi, "api").mockImplementation((path) => {
    if (path === "/api/v1/auth/me") return Promise.resolve(user);
    if (path === "/api/v1/projects") return Promise.resolve([project]);
    if (path.endsWith("/requirements") || path.endsWith("/tasks")) return Promise.resolve([]);
    if (path.endsWith("/artifacts")) return Promise.resolve([artifact]);
    return Promise.resolve({ current_role: "owner" });
  });
  render(<Workspace />);
  return screen.findByText(String(artifact.title)).then((title) => { fireEvent.click(title); });
}

describe("Workspace artifact document rendering", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders structured acceptance criteria and falls back to the artifact title", async () => {
    await openArtifact({ ...base, title: "Transfer rules", artifact_type: "acceptance_criteria", content: { criteria: [{ case_type: "edge_case", given: "A transfer is pending", when: "The balance is insufficient", then: "It is rejected" }] } });
    expect(screen.getByText("FOR USER STORY")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Transfer rules" })).toBeInTheDocument();
    expect(screen.getByText("edge_case")).toBeInTheDocument();
    expect(screen.getByText("It is rejected")).toBeInTheDocument();
  });

  it("fills user story placeholders when optional model fields are missing", async () => {
    await openArtifact({ ...base, title: "Untitled story", artifact_type: "user_story", content: { stories: [{}] } });
    expect(screen.getByText("STORY 1")).toBeInTheDocument();
    expect(screen.getByText("Unprioritized")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "User story" })).toBeInTheDocument();
    expect(screen.getByText("Not estimated")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("No dependencies")).toBeInTheDocument();
  });

  it("renders test steps, fallback IDs and titles, optional traceability, and empty cases", async () => {
    await openArtifact({ ...base, title: "Transfer tests", artifact_type: "test_case", content: { cases: [{ category: "", title: "", steps: ["Sign in", 2], expected_result: "Accepted", traceability: "US-1" }, { category: "security", steps: [], expected_result: "Blocked" }] } });
    expect(screen.getByText("TEST 01")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Test case 1" })).toBeInTheDocument();
    expect(screen.getByText("US-1")).toBeInTheDocument();
    expect(screen.getByText("TEST 02")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("renders empty structured payloads through the generic content fallback", async () => {
    await openArtifact({ ...base, title: "Empty criteria", artifact_type: "acceptance_criteria", content: {} });
    expect(screen.getByText("No structured content was returned for this artifact.")).toBeInTheDocument();
  });

  it("renders sprint grouping, point totals, dependencies, and the empty sprint fallback", async () => {
    await openArtifact({ ...base, title: "Delivery plan", artifact_type: "sprint_plan", content: { assumed_velocity_points_per_sprint: 15, items: [{ story_title: "Authorize", sprint: "1", story_points: 5, effort_estimate_hours: 8, dependencies: ["Login"] }, { story_title: "Settle", sprint: "2", story_points: 3 }], critical_path: ["Authorize", "Settle"] } });
    expect(screen.getByRole("heading", { level: 2, name: "Delivery plan" })).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/1 dependencies/)).toBeInTheDocument();
    expect(screen.getByText("Critical path")).toBeInTheDocument();
  });

  it("renders architecture recommendations and derives a named request journey", async () => {
    await openArtifact({ ...base, title: "Architecture", artifact_type: "architecture", content: { pattern: "Event-driven", rationale: "Scales independently", technology_recommendations: ["Kafka", "PostgreSQL"], components: [{ name: "Gateway", responsibility: "Routes requests", technology: "FastAPI" }, { name: "Ledger", responsibility: "Stores transfers", technology: "Postgres" }], data_flow: "Gateway receives request -> Ledger stores transfer", security_considerations: ["Encrypt traffic"] } });
    expect(screen.getByRole("heading", { level: 3, name: "Event-driven" })).toBeInTheDocument();
    expect(screen.getByText("Kafka")).toBeInTheDocument();
    expect(screen.getAllByText("Gateway").length).toBeGreaterThan(0);
    expect(screen.getByText("Request journey")).toBeInTheDocument();
    expect(screen.getByText("View original flow description")).toBeInTheDocument();
  });

  it("renders a single-step architecture flow when no sequence can be inferred", async () => {
    await openArtifact({ ...base, title: "Simple architecture", artifact_type: "architecture", content: { data_flow: "A request is handled." } });
    expect(screen.getByText("Flow description")).toBeInTheDocument();
    expect(screen.getByText("A request is handled.")).toBeInTheDocument();
  });

  it("renders API request and response schemas, optional descriptions, and errors", async () => {
    await openArtifact({ ...base, title: "Transfer API", artifact_type: "api_spec", content: { endpoints: [{ method: "post", path: "/transfers", description: "Create a transfer", request_schema: [{ name: "amount", type: "number", required: false }, { name: "currency", type: "string" }], response_schema: [{ name: "id", type: "string", description: "Transfer id" }], error_codes: [{ code: "409", reason: "Conflict" }] }] } });
    expect(screen.getByText("POST")).toBeInTheDocument();
    expect(screen.getByText("Request schema")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Transfer id")).toBeInTheDocument();
    expect(screen.getByText("409")).toBeInTheDocument();
  });

  it("renders nested generic content and empty schemas for unrecognized types", async () => {
    await openArtifact({ ...base, title: "Release brief", artifact_type: "release_brief", content: { releaseNotes: "Ready", sections: ["Payments", "Transfers"], owners: [{ name: "Ari", scope: "API" }], metadata: { version: 2 }, empty: "", absent: null } });
    expect(screen.getByText("Release Notes")).toBeInTheDocument();
    expect(screen.getAllByText("Payments").length).toBeGreaterThan(0);
    expect(screen.getByText("Ari")).toBeInTheDocument();
    expect(screen.getByText("Version")).toBeInTheDocument();
  });

  it("copies nested artifact data as readable Markdown", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await openArtifact({ ...base, title: "Nested artifact", artifact_type: "release_brief", content: { summary: "Ready", list: ["plain item", { title: "Nested record", count: 2 }], metadata: { version: 3 }, ignored: null } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("# Nested artifact"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Nested record"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("**Version:** 3"));
  });
});
