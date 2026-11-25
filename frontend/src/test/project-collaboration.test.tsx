import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backendApi from "@/lib/backend-api";
import { ProjectActivityPanel, ProjectCollaboration } from "@/components/ProjectCollaboration";

const projectId = "project-1";
const token = "test-token";

const team = {
  project_id: projectId,
  current_role: "owner",
  can_manage_members: true,
  can_manage_admins: true,
  members: [
    {
      user_id: "owner",
      email: "owner@example.test",
      full_name: "Project Owner",
      role: "owner",
      joined_at: "2026-01-01T00:00:00Z",
      is_current_user: true,
    },
    {
      user_id: "admin",
      email: "admin@example.test",
      full_name: "Team Admin",
      role: "admin",
      joined_at: "2026-01-02T00:00:00Z",
      is_current_user: false,
    },
    {
      user_id: "editor",
      email: "editor@example.test",
      full_name: "Team Editor",
      role: "editor",
      joined_at: "2026-01-03T00:00:00Z",
      is_current_user: false,
    },
  ],
  invitations: [
    {
      id: "pending",
      email: "pending@example.test",
      role: "viewer",
      status: "pending",
      created_at: "2026-02-01T00:00:00Z",
      expires_at: "2026-02-08T00:00:00Z",
    },
    {
      id: "expired",
      email: "expired@example.test",
      role: "editor",
      status: "expired",
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-08T00:00:00Z",
    },
    {
      id: "accepted",
      email: "accepted@example.test",
      role: "viewer",
      status: "accepted",
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-08T00:00:00Z",
    },
  ],
};

function mockTeamApi(overrides: Record<string, unknown> = {}) {
  return vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
    if (path === `/api/v1/projects/${projectId}/members` && !init) return Promise.resolve(team);
    if (path === `/api/v1/projects/${projectId}/invitations` && init?.method === "POST") {
      return Promise.resolve({
        token: "single-use-token",
        email: "new@example.test",
        role: "editor",
        expires_at: "2026-02-08T00:00:00Z",
      });
    }
    return Promise.resolve(overrides[path] ?? {});
  });
}

describe("ProjectCollaboration", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads the team, manages roles, creates and copies an invite, and revokes pending invitations", async () => {
    const apiSpy = mockTeamApi();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<ProjectCollaboration projectId={projectId} token={token} />);

    expect(await screen.findByText("Project Owner")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Invite by email")).toBeInTheDocument();
    expect(screen.getByText("expired")).toBeInTheDocument();
    expect(screen.queryByText("accepted@example.test")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role for admin@example.test"), {
      target: { value: "editor" },
    });
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/projects/${projectId}/members/admin`,
        token,
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "editor" }) }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove editor@example.test" }));
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(`/api/v1/projects/${projectId}/members/editor`, token, {
        method: "DELETE",
      }),
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Project role"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invite link created for new@example.test",
    );
    const inviteInput = screen.getByLabelText(
      "Share this link (expires in 7 days)",
    ) as HTMLInputElement;
    expect(inviteInput.value).toContain("invite=single-use-token");
    fireEvent.focus(inviteInput);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(inviteInput.value));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@example.test" }));
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/projects/${projectId}/invitations/pending`,
        token,
        { method: "DELETE" },
      ),
    );
  });

  it("shows an empty team and hides management controls for a viewer", async () => {
    const viewerTeam = {
      ...team,
      current_role: "viewer",
      can_manage_members: false,
      can_manage_admins: false,
      members: [],
    };
    vi.spyOn(backendApi, "api").mockResolvedValue(viewerTeam);

    render(<ProjectCollaboration projectId={projectId} token={token} />);

    expect(await screen.findByText("No project members found.")).toBeInTheDocument();
    expect(screen.queryByText("Invite by email")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending invitations")).not.toBeInTheDocument();
  });

  it("reports load and invite failures and still releases the busy state", async () => {
    let invitationFails = false;
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === `/api/v1/projects/${projectId}/members`) return Promise.resolve(team);
      if (init?.method === "POST" && invitationFails) return Promise.reject("invite failed");
      return Promise.resolve({ token: "ok", email: "new@example.test", role: "editor" });
    });
    render(<ProjectCollaboration projectId={projectId} token={token} />);

    expect(await screen.findByText("Project Owner")).toBeInTheDocument();
    invitationFails = true;
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the invitation.");
    expect(screen.getByRole("button", { name: "Create invitation link" })).toBeEnabled();

    apiSpy.mockRejectedValueOnce(new Error("refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("refresh failed");
  });

  it("reports member and invitation action failures without leaving controls busy", async () => {
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation((path, _token, init) => {
      if (path === `/api/v1/projects/${projectId}/members` && !init) return Promise.resolve(team);
      return Promise.reject("action failed");
    });
    render(<ProjectCollaboration projectId={projectId} token={token} />);
    await screen.findByText("Project Owner");

    const roleSelect = screen.getByLabelText("Role for admin@example.test");
    fireEvent.change(roleSelect, { target: { value: "admin" } });
    expect(apiSpy).toHaveBeenCalledTimes(1);
    fireEvent.change(roleSelect, { target: { value: "editor" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not update this member's role.",
    );
    expect(roleSelect).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove editor@example.test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove this member.");

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@example.test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not revoke this invitation.");
    expect(apiSpy).toHaveBeenCalledTimes(4);
  });

  it("shows the manual-copy fallback when clipboard access fails", async () => {
    mockTeamApi();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("clipboard denied"));
    render(<ProjectCollaboration projectId={projectId} token={token} />);
    await screen.findByText("Project Owner");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Select and copy the invitation link below.",
    );
  });
});

describe("ProjectActivityPanel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders known and unknown audit events and refreshes the activity feed", async () => {
    const events = [
      {
        id: "generated",
        action: "artifact.generate",
        resource_type: "artifact",
        details: { artifact_type: "user_story", title: "Payments", version: 2 },
        actor_name: "Alex",
        created_at: "2026-02-01T12:00:00Z",
      },
      {
        id: "custom",
        action: "custom.event_name",
        resource_type: "project_chat",
        details: {},
        actor_email: "person@example.test",
        created_at: "2026-02-02T12:00:00Z",
      },
    ];
    const apiSpy = vi.spyOn(backendApi, "api").mockResolvedValue(events);
    render(<ProjectActivityPanel projectId={projectId} token={token} />);

    expect(await screen.findByText("Generated user story")).toBeInTheDocument();
    expect(screen.getByText("Payments · v2 · by Alex")).toBeInTheDocument();
    expect(screen.getByText("custom event name")).toBeInTheDocument();
    expect(screen.getByText("project chat activity · by person@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));

    await waitFor(() => expect(apiSpy).toHaveBeenCalledTimes(2));
    expect(apiSpy).toHaveBeenCalledWith(`/api/v1/projects/${projectId}/activity?limit=100`, token);
  });

  it("renders empty and error states and allows retry", async () => {
    const apiSpy = vi
      .spyOn(backendApi, "api")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("audit unavailable"));
    render(<ProjectActivityPanel projectId={projectId} token={token} />);

    expect(
      await screen.findByText("No project activity has been recorded yet."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("audit unavailable");
    expect(apiSpy).toHaveBeenCalledTimes(2);
  });
});
