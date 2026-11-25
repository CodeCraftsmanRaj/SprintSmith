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

  it("keeps the artifact dialog closable after exporting controls are available", async () => {
    const createObjectUrl = vi.fn(() => "blob:test-artifact");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockWorkspace([story]);
    render(<Workspace />);

    fireEvent.click(await screen.findByText("Transfer funds"));
    fireEvent.click(screen.getByRole("button", { name: "Export .md" }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-artifact");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Transfer funds" })).not.toBeInTheDocument());
  });
});
