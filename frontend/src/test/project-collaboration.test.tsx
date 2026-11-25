import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectActivityPanel, ProjectCollaboration } from "@/components/ProjectCollaboration";
import * as backendApi from "@/lib/backend-api";

const owner = { user_id: "owner", email: "owner@test.dev", full_name: "Owner", role: "owner", joined_at: "2026-01-01", is_current_user: true };
const editor = { user_id: "editor", email: "edit@test.dev", full_name: "Editor", role: "editor", joined_at: "2026-01-02", is_current_user: false };
const admin = { user_id: "admin", email: "admin@test.dev", full_name: "Admin", role: "admin", joined_at: "2026-01-03", is_current_user: false };
const invitation = { id: "inv-1", email: "pending@test.dev", role: "viewer", status: "pending", created_at: "2026-01-04", expires_at: "2026-01-11" };
const team = (overrides: Record<string, unknown> = {}) => ({ project_id: "project-1", current_role: "owner", can_manage_members: true, can_manage_admins: true, members: [owner, editor, admin], invitations: [invitation, { ...invitation, id: "inv-2", email: "expired@test.dev", status: "expired" }, { ...invitation, id: "inv-3", email: "accepted@test.dev", status: "accepted" }], ...overrides });

describe("ProjectCollaboration", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders members, role guide, pending and expired invitations; hides accepted invitations", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue(team() as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    expect(await screen.findByText("Project team")).toBeInTheDocument();
    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Project roles")).toBeInTheDocument();
    expect(screen.getByText("pending@test.dev")).toBeInTheDocument();
    expect(screen.getByText("expired@test.dev")).toBeInTheDocument();
    expect(screen.queryByText("accepted@test.dev")).not.toBeInTheDocument();
  });

  it("shows a load error and allows retry", async () => {
    const api = vi.spyOn(backendApi, "api").mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(team() as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Refresh team" }));
    expect(await screen.findByText("Project team")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("limits member controls for a manager who cannot manage admins", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue(team({ can_manage_admins: false }) as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    expect(screen.getByLabelText("Role for edit@test.dev")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for admin@test.dev")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove admin@test.dev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows read-only role badges when the current user cannot manage members", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue(team({ can_manage_members: false, members: [...team().members, { user_id: "viewer", email: "view@test.dev", full_name: "Viewer", role: "viewer", joined_at: "2026-01-04", is_current_user: false }] }) as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    expect(screen.getAllByText("Viewer").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Invite by email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending invitations" })).not.toBeInTheDocument();
  });

  it("shows empty member and invitation states", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue(team({ members: [], invitations: [] }) as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    expect(await screen.findByText("No project members found.")).toBeInTheDocument();
    expect(screen.getByText("No pending invitations. New links remain valid for 7 days.")).toBeInTheDocument();
  });

  it("uses stable error messages when member actions reject non-Error values", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(async (path) => {
      if (String(path).endsWith("/members")) return team() as never;
      return Promise.reject("request rejected");
    });
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    fireEvent.change(screen.getByLabelText("Role for edit@test.dev"), { target: { value: "viewer" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update this member's role.");
    fireEvent.click(screen.getByRole("button", { name: "Remove edit@test.dev" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove this member.");
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@test.dev" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not revoke this invitation.");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fail@test.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the invitation.");
    expect(api).toHaveBeenCalled();
  });

  it("creates an invitation, reloads members, and copies the generated link", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(async (path) => {
      if (path.endsWith("/members")) return team() as never;
      return { token: "invite-token", email: "new@test.dev", role: "editor", expires_at: "2026-02-01" } as never;
    });
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@test.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invite link created for new@test.dev");
    expect(screen.getByLabelText("Share this link (expires in 7 days)")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/invite=invite-token/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/api/v1/projects/project-1/invitations", "token", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "new@test.dev", role: "editor" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("invite=invite-token")));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("reports invitation API and clipboard errors", async () => {
    vi.spyOn(backendApi, "api").mockImplementation(async (path) => path.endsWith("/members") ? team() as never : Promise.reject(new Error("Invite denied")));
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@test.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invite denied");
  });

  it("changes a role, avoids redundant updates, removes a member, and revokes an invite", async () => {
    const api = vi.spyOn(backendApi, "api").mockResolvedValue(team() as never);
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    fireEvent.change(screen.getByLabelText("Role for edit@test.dev"), { target: { value: "editor" } });
    expect(api.mock.calls.filter(([path, , init]) => String(path).includes("/members/editor") && init?.method === "PATCH")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Role for edit@test.dev"), { target: { value: "viewer" } });
    expect(api).toHaveBeenCalledWith("/api/v1/projects/project-1/members/editor", "token", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "viewer" }) }));
    await waitFor(() => expect(api.mock.calls.filter(([path, , init]) => String(path).includes("/members/editor") && init?.method === "PATCH")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Remove edit@test.dev" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/projects/project-1/members/editor", "token", expect.objectContaining({ method: "DELETE" })));
    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@test.dev" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/v1/projects/project-1/invitations/inv-1", "token", expect.objectContaining({ method: "DELETE" })));
  });

  it("renders empty invitation feedback after server action errors", async () => {
    vi.spyOn(backendApi, "api").mockImplementation(async (path) => path.endsWith("/members") ? team() as never : Promise.reject("request failed"));
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");
    fireEvent.click(screen.getByRole("button", { name: "Remove edit@test.dev" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove this member.");
  });

  it("uses a friendly message when loading the team rejects a non-Error value", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue("offline");
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the project team.");
  });

  it("surfaces server error messages for member and invitation actions", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(async (path, _token, init) => {
      const target = String(path);
      if (target.endsWith("/members") && !init) return team() as never;
      if (target.includes("/members/editor") && init?.method === "PATCH") throw new Error("Role update failed");
      if (target.includes("/members/") && init?.method === "DELETE") throw new Error("Remove failed");
      if (target.includes("/invitations/") && init?.method === "DELETE") throw new Error("Revoke failed");
      throw new Error("Invite failed");
    });
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");

    fireEvent.change(screen.getByLabelText("Role for edit@test.dev"), { target: { value: "viewer" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Role update failed");

    fireEvent.click(screen.getByRole("button", { name: "Remove edit@test.dev" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Remove failed"));

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@test.dev" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Revoke failed"));

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@test.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invite failed"));
    expect(api).toHaveBeenCalled();
  });

  it("handles role selection, invite-link focus, and clipboard failure", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(async (path) => {
      if (String(path).endsWith("/members")) return team() as never;
      return { token: "invite-token", email: "new@test.dev", role: "viewer", expires_at: "2026-02-01" } as never;
    });
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
    const select = vi.spyOn(HTMLInputElement.prototype, "select").mockImplementation(() => {});
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");

    fireEvent.change(screen.getByLabelText("Project role"), { target: { value: "viewer" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@test.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation link" }));

    const link = await screen.findByLabelText("Share this link (expires in 7 days)");
    expect(api).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/invitations",
      "token",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "new@test.dev", role: "viewer" }) }),
    );
    fireEvent.focus(link);
    expect(select).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Select and copy the invitation link below.");
  });

  it("uses email fallbacks and confirms successful member and invitation actions", async () => {
    const nameless = { user_id: "nameless", email: "nameless@test.dev", full_name: "", role: "editor", joined_at: "2026-01-02", is_current_user: false };
    vi.spyOn(backendApi, "api").mockImplementation(async (path, _token, init) => {
      if (String(path).endsWith("/members") && !init) return team({ members: [owner, nameless] }) as never;
      return {} as never;
    });
    render(<ProjectCollaboration projectId="project-1" token="token" />);
    await screen.findByText("Project team");

    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getAllByText("nameless@test.dev").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Role for nameless@test.dev"), { target: { value: "viewer" } });
    expect(await screen.findByRole("status")).toHaveTextContent("nameless@test.dev is now Viewer.");

    fireEvent.click(screen.getByRole("button", { name: "Remove nameless@test.dev" }));
    expect(await screen.findByRole("status")).toHaveTextContent("nameless@test.dev was removed from the project.");

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite for pending@test.dev" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation for pending@test.dev was revoked.");
  });
});

describe("ProjectActivityPanel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("formats known and unknown events with useful details", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue([
      { id: "1", action: "artifact.generate", resource_type: "artifact", details: { artifact_type: "user_story", title: "Checkout", version: 2 }, actor_name: "Ari", created_at: "2026-01-04T12:00:00Z" },
      { id: "2", action: "custom.event_name", resource_type: "project_item", details: { filename: "brief.pdf" }, actor_email: "ari@test.dev", created_at: "2026-01-05T12:00:00Z" },
      { id: "3", action: "project.create", resource_type: "project", details: {}, created_at: "2026-01-06T12:00:00Z" },
    ] as never);
    render(<ProjectActivityPanel projectId="project-1" token="token" />);
    expect(await screen.findByText("Generated user story")).toBeInTheDocument();
    expect(screen.getByText("Checkout · v2 · by Ari")).toBeInTheDocument();
    expect(screen.getByText("custom event name")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf · by ari@test.dev")).toBeInTheDocument();
    expect(screen.getByText("Created the project")).toBeInTheDocument();
  });

  it("handles empty, failed, and refresh activity requests", async () => {
    const api = vi.spyOn(backendApi, "api").mockResolvedValueOnce([] as never).mockRejectedValueOnce(new Error("Activity unavailable")).mockResolvedValueOnce([] as never);
    render(<ProjectActivityPanel projectId="project-1" token="token" />);
    expect(await screen.findByText("No project activity has been recorded yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Activity unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));
    expect(await screen.findByText("No project activity has been recorded yet.")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("formats activity with empty details and without an actor", async () => {
    vi.spyOn(backendApi, "api").mockResolvedValue([
      { id: "bare", action: "unknown_action", resource_type: "project_change", details: null, created_at: "2026-01-01T00:00:00Z" },
    ] as never);
    render(<ProjectActivityPanel projectId="project-1" token="token" />);
    expect(await screen.findByText("unknown action")).toBeInTheDocument();
    expect(screen.getByText("project change activity")).toBeInTheDocument();
    expect(screen.queryByText(/by /)).not.toBeInTheDocument();
  });

  it("uses a friendly message for non-Error failures and defaults missing artifact types", async () => {
    vi.spyOn(backendApi, "api")
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce([
        { id: "generated", action: "artifact.generate", resource_type: "artifact", details: {}, actor_name: null, actor_email: null, created_at: "2026-01-01T00:00:00Z" },
      ] as never);
    render(<ProjectActivityPanel projectId="project-1" token="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load project activity.");

    fireEvent.click(screen.getByRole("button", { name: "Refresh project activity" }));
    expect(await screen.findByText("Generated artifact")).toBeInTheDocument();
    expect(screen.queryByText(/by /)).not.toBeInTheDocument();
  });
});
