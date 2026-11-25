import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, Check, Clock3, Copy, Mail, RefreshCw, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/backend-api";

type ProjectRole = "owner" | "admin" | "editor" | "viewer";

type Member = {
  user_id: string;
  email: string;
  full_name: string;
  role: ProjectRole;
  joined_at: string;
  is_current_user: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: Exclude<ProjectRole, "owner">;
  status: "pending" | "expired" | "accepted" | "revoked";
  created_at: string;
  expires_at: string;
};

type Team = {
  project_id: string;
  current_role: ProjectRole;
  can_manage_members: boolean;
  can_manage_admins: boolean;
  members: Member[];
  invitations: Invitation[];
};

type ActivityItem = {
  id: string;
  action: string;
  resource_type: string;
  details: Record<string, unknown>;
  actor_name?: string | null;
  actor_email?: string | null;
  created_at: string;
};

const roleDescription: Record<ProjectRole, string> = {
  owner: "Full control, including project deletion and role administration.",
  admin: "Manage project details, members, invitations, and project work.",
  editor: "Add requirements, generate deliverables, and update project work.",
  viewer: "View project details, team, and activity without making changes.",
};

function dateLabel(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function roleLabel(role: ProjectRole): string {
  return role === "admin" ? "Admin" : role.charAt(0).toUpperCase() + role.slice(1);
}

export function ProjectCollaboration({ projectId, token }: { projectId: string; token: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("editor");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTeam(await api<Team>(`/api/v1/projects/${projectId}/members`, token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the project team.");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const invitation = await api<{ token: string; email: string; role: string; expires_at: string }>(
        `/api/v1/projects/${projectId}/invitations`,
        token,
        { method: "POST", body: JSON.stringify({ email, role }) },
      );
      const link = new URL(window.location.href);
      link.pathname = "/";
      link.search = "";
      link.hash = "";
      link.searchParams.set("invite", invitation.token);
      setInviteUrl(link.toString());
      setCopied(false);
      setEmail("");
      setNotice(`Invite link created for ${invitation.email}. It expires in 7 days.`);
      await loadTeam();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, nextRole: ProjectRole) {
    if (nextRole === member.role) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/projects/${projectId}/members/${member.user_id}`, token, {
        method: "PATCH", body: JSON.stringify({ role: nextRole }),
      });
      setNotice(`${member.full_name || member.email} is now ${roleLabel(nextRole)}.`);
      await loadTeam();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this member's role.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/projects/${projectId}/members/${member.user_id}`, token, { method: "DELETE" });
      setNotice(`${member.full_name || member.email} was removed from the project.`);
      await loadTeam();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this member.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/v1/projects/${projectId}/invitations/${invitation.id}`, token, { method: "DELETE" });
      setNotice(`Invitation for ${invitation.email} was revoked.`);
      await loadTeam();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke this invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setNotice("Select and copy the invitation link below.");
    }
  }

  const activeInvitations = team?.invitations.filter((invite) => invite.status === "pending" || invite.status === "expired") ?? [];

  return <div className="collaboration-layout">
    <section className="panel collaboration-card">
      <div className="panel-heading">
        <div><span className="section-kicker">SHARED WORKSPACE</span><h2>Project team <span className="count-badge">{team?.members.length ?? 0}</span></h2></div>
        <button className="icon-button" onClick={() => void loadTeam()} disabled={loading} aria-label="Refresh team"><RefreshCw size={15} className={loading ? "spin" : ""} /></button>
      </div>
      <p className="panel-copy">Share this project with teammates and control what each person can do.</p>
      {error && <div className="collaboration-message error" role="alert">{error}</div>}
      {notice && <div className="collaboration-message success" role="status">{notice}</div>}
      {loading ? <div className="collaboration-empty">Loading project members…</div> : <div className="member-list">
        {team?.members.map((member) => {
          const canChange = Boolean(team.can_manage_members && member.role !== "owner" && (!((member.role === "admin") && !team.can_manage_admins)));
          return <article className="member-row" key={member.user_id}>
            <span className="member-avatar">{(member.full_name || member.email).slice(0, 1).toUpperCase()}</span>
            <div className="member-copy"><b>{member.full_name || member.email}{member.is_current_user ? <small className="you-tag">You</small> : null}</b><span>{member.email}</span></div>
            <div className="member-role-control">
              <label className="sr-only" htmlFor={`role-${member.user_id}`}>Role for {member.email}</label>
              {canChange ? <select id={`role-${member.user_id}`} value={member.role} disabled={busy} onChange={(event) => void changeRole(member, event.target.value as ProjectRole)}>
                {team.can_manage_admins && <option value="admin">Admin</option>}
                <option value="editor">Editor</option><option value="viewer">Viewer</option>
              </select> : <span className={`role-pill role-${member.role}`}><Shield size={12} />{roleLabel(member.role)}</span>}
            </div>
            <time>{member.role === "owner" ? "Project owner" : `Joined ${new Date(member.joined_at).toLocaleDateString()}`}</time>
            {team.can_manage_members && member.role !== "owner" && (!((member.role === "admin") && !team.can_manage_admins)) && <button type="button" className="icon-button danger-icon" aria-label={`Remove ${member.email}`} disabled={busy} onClick={() => void removeMember(member)}><Trash2 size={15} /></button>}
          </article>;
        })}
        {!team?.members.length && <div className="collaboration-empty">No project members found.</div>}
      </div>}
    </section>

    {team?.can_manage_members && <section className="collaboration-side">
      <section className="panel collaboration-card invite-card">
        <div className="panel-heading"><div><span className="section-kicker">ADD A TEAMMATE</span><h2>Invite by email</h2></div><span className="collaboration-icon"><UserPlus size={17} /></span></div>
        <p className="panel-copy">Create a single-use invitation link and send it to your teammate.</p>
        <form className="stack-form" onSubmit={invite}>
          <label className="field-label" htmlFor="invite-email">Email address</label>
          <input id="invite-email" type="email" className="text-input" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" />
          <label className="field-label" htmlFor="invite-role">Project role</label>
          <select id="invite-role" className="text-input" value={role} onChange={(event) => setRole(event.target.value as Exclude<ProjectRole, "owner">)}>
            {team.can_manage_admins && <option value="admin">Admin</option>}
            <option value="editor">Editor</option><option value="viewer">Viewer</option>
          </select>
          <small className="role-help">{roleDescription[role]}</small>
          <button type="submit" className="button button-primary full-button" disabled={busy || !email.trim()}><Mail size={14} />{busy ? "Creating invite…" : "Create invitation link"}</button>
        </form>
        {inviteUrl && <div className="invite-link-box"><label className="field-label" htmlFor="invite-link">Share this link (expires in 7 days)</label><div className="invite-link-row"><input id="invite-link" className="text-input" value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className="button button-quiet button-small" onClick={() => void copyInvite()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button></div></div>}
      </section>
      <section className="panel collaboration-card role-guide">
        <div className="panel-heading"><div><span className="section-kicker">ACCESS LEVELS</span><h2>Project roles</h2></div><Users size={17} className="muted-icon" /></div>
        {(["owner", "admin", "editor", "viewer"] as ProjectRole[]).map((item) => <div className="role-guide-row" key={item}><span className={`role-pill role-${item}`}>{roleLabel(item)}</span><p>{roleDescription[item]}</p></div>)}
      </section>
    </section>}

    {team?.can_manage_members && <section className="panel collaboration-card pending-invites">
      <div className="panel-heading"><div><span className="section-kicker">INVITATIONS</span><h2>Pending invitations <span className="count-badge">{activeInvitations.length}</span></h2></div></div>
      {activeInvitations.length ? <div className="member-list">{activeInvitations.map((invitation) => <article className="member-row invitation-row" key={invitation.id}>
        <span className="member-avatar invitation-avatar"><Mail size={15} /></span>
        <div className="member-copy"><b>{invitation.email}</b><span>{roleLabel(invitation.role)} · sent {dateLabel(invitation.created_at)}</span></div>
        <span className={`invitation-status ${invitation.status}`}>{invitation.status}</span>
        {invitation.status === "pending" && <button type="button" className="icon-button danger-icon" aria-label={`Revoke invite for ${invitation.email}`} disabled={busy} onClick={() => void revokeInvitation(invitation)}><Trash2 size={15} /></button>}
      </article>)}</div> : <div className="collaboration-empty">No pending invitations. New links remain valid for 7 days.</div>}
    </section>}
  </div>;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "project.create": "Created the project",
    "project.update": "Updated project details",
    "project.member.role_changed": "Changed a team member's role",
    "project.member.removed": "Removed a team member",
    "project.member.set": "Added a team member",
    "project.invitation.created": "Invited a teammate",
    "project.invitation.accepted": "Joined the project",
    "project.invitation.revoked": "Revoked an invitation",
    "requirement.ingest": "Added a requirement",
    "artifact.generate": "Generated an artifact",
    "artifact.update": "Updated an artifact",
    "artifact.evaluate": "Reviewed an artifact",
    "project.chat": "Used the project assistant",
    "project.case_study": "Generated a case study",
  };
  return labels[action] ?? action.replaceAll(".", " ").replaceAll("_", " ");
}

function activityDetail(item: ActivityItem): string {
  const details = item.details ?? {};
  const values = [details.email, details.filename, details.role, details.version ? `v${details.version}` : null]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number");
  return values.length ? values.join(" · ") : `${item.resource_type.replaceAll("_", " ")} activity`;
}

export function ProjectActivityPanel({ projectId, token }: { projectId: string; token: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api<ActivityItem[]>(`/api/v1/projects/${projectId}/activity?limit=100`, token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load project activity.");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);
  useEffect(() => { void loadActivity(); }, [loadActivity]);

  return <section className="panel table-panel collaboration-activity">
    <div className="panel-heading"><div><span className="section-kicker">PROJECT AUDIT TRAIL</span><h2>Recent activity</h2></div><button className="icon-button" onClick={() => void loadActivity()} aria-label="Refresh project activity" disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /></button></div>
    <p className="panel-copy">Team invitations, membership changes, requirements, and deliverables.</p>
    {error && <div className="collaboration-message error" role="alert">{error}</div>}
    {loading ? <div className="collaboration-empty">Loading project activity…</div> : items.length ? <div className="timeline">{items.map((item) => <div className="timeline-item" key={item.id}>
      <span className="timeline-icon purple-bg"><Activity size={16} /></span>
      <div><b>{actionLabel(item.action)}</b><small>{activityDetail(item)}{item.actor_name || item.actor_email ? ` · by ${item.actor_name || item.actor_email}` : ""}</small></div>
      <time><Clock3 size={12} />{dateLabel(item.created_at)}</time>
    </div>)}</div> : <div className="collaboration-empty">No project activity has been recorded yet.</div>}
  </section>;
}
