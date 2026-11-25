import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectActivityPanel, ProjectCollaboration } from "@/components/ProjectCollaboration";
import * as backendApi from "@/lib/backend-api";

const owner = {
  user_id: "owner-1", email: "owner@example.com", full_name: "Project Owner",
  role: "owner" as const, joined_at: "2026-01-01T00:00:00Z", is_current_user: true,
};
const editor = {
  user_id: "editor-1", email: "editor@example.com", full_name: "Project Editor",
  role: "editor" as const, joined_at: "2026-01-02T00:00:00Z", is_current_user: false,
};
const team = {
  project_id: "project-1", current_role: "owner" as const,
  can_manage_members: true, can_manage_admins: true,
  members: [owner, editor],
  invitations: [
    { id: "invite-1", email: "pending@example.com", role: "viewer" as const, status: "pending" as const, created_at: "2026-01-03T00:00:00Z", expires_at: "2026-01-10T00:00:00Z" },
    { id: "invite-2", email: "expired@example.com", role: "editor" as const, status: "expired" as const, created_at: "2025-01-03T00:00:00Z", expires_at: "2025-01-10T00:00:00Z" },
    { id: "invite-3", email: "accepted@example.com", role: "viewer" as const, status: "accepted" as const, created_at: "2026-01-03T00:00:00Z", expires_at: "2026-01-10T00:00:00Z" },
  ],
};

describe("Project collaboration UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/workspace?project=project-1");
  });

  it("shows roles and invitations, creates and copies an invite, changes roles, and revokes invites", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation(async (path, _token, init) => {
      if (path.endsWith("/members") && !init?.method) return team;
      if (path.endsWith("/invitations") && init?.method === "POST") {
        return { token: "a-long-invitation-token-value", email: "new@example.com", role: "editor", expires_at: "2026-01-10T00:00:00Z" };
      }
      return {};
    });
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<ProjectCollaboration projectId="project-1" token="auth-token" />);
    expect(await screen.findByText("Project Owner")).toBeInTheDocument();
    expect(screen.getByText("Project Editor")).toBeInTheDocument();
    expect(screen.getByText("expired")).toBeInTheDocument();
    expect(screen.queryByText("accepted@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("Full control, including project deletion and role administration.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Create invitation link/i }));
    expect(await screen.findByText(/Invite link created for new@example.com/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Share this link/)).toHaveValue(
      "http://localhost:3000/?invite=a-long-invitation-token-value",
    );
    expect(apiSpy).toHaveBeenCalledWith("/api/v1/projects/project-1/invitations", "auth-token", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("invite=a-long-invitation-token-value")));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role for editor@example.com"), { target: { value: "viewer" } });
    await waitFor(() => expect(apiSpy).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/members/editor-1", "auth-token",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "viewer" }) }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@example.com" }));
    await waitFor(() => expect(apiSpy).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/invitations/invite-1", "auth-token", { method: "DELETE" },
    ));
  });

  it("hides management controls from viewers and reports load failures", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Access denied"));
    render(<ProjectCollaboration projectId="project-1" token="auth-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.queryByText("Invite by email")).not.toBeInTheDocument();
    expect(screen.getByText("No project members found.")).toBeInTheDocument();
  });
});

describe("Project activity panel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders activity labels, details, actors, fallback labels, and refreshes empty state", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockResolvedValueOnce([
      { id: "a1", action: "artifact.generate", resource_type: "artifact", details: { artifact_type: "user_story", title: "Checkout flow", version: 2 }, actor_name: "Project Owner", created_at: "2026-01-03T00:00:00Z" },
      { id: "a2", action: "project.invitation.created", resource_type: "project", details: { email: "new@example.com", role: "editor" }, actor_email: "owner@example.com", created_at: "2026-01-02T00:00:00Z" },
      { id: "a3", action: "custom.new_action", resource_type: "project_event", details: {}, created_at: "2026-01-01T00:00:00Z" },
    ]).mockResolvedValueOnce([]);
    render(<ProjectActivityPanel projectId="project-1" token="auth-token" />);
    expect(await screen.findByText("Generated user story")).toBeInTheDocument();
    expect(screen.getByText("Checkout flow · v2 · by Project Owner")).toBeInTheDocument();
    expect(screen.getByText("Invited a teammate")).toBeInTheDocument();
    expect(screen.getByText("new@example.com · editor · by owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("custom new action")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));
    expect(await screen.findByText("No project activity has been recorded yet.")).toBeInTheDocument();
    expect(apiSpy).toHaveBeenCalledTimes(2);
  });

  it("shows errors from activity requests", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue(new Error("Activity unavailable"));
    render(<ProjectActivityPanel projectId="project-1" token="auth-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Activity unavailable");
  });
});
