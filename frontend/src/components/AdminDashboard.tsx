import { useCallback, useEffect, useState } from "react";
import { FolderKanban, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/backend-api";

type AdminOverview = {
  summary: { users: number; projects: number; collaborators: number; admins: number };
  users: Array<{
    id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string;
  }>;
  projects: Array<{
    id: string; name: string; owner_name: string; owner_email: string; collaborators: number; created_at: string;
  }>;
};

const panel = "rounded-xl border border-[#353846] bg-[#20222b]";

export function AdminDashboard({ token }: { token: string }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<AdminOverview>("/api/v1/admin/overview", token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the admin overview.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const stats = data?.summary ?? { users: 0, projects: 0, collaborators: 0, admins: 0 };
  const cards = [
    { label: "Platform users", value: stats.users, icon: Users },
    { label: "Projects", value: stats.projects, icon: FolderKanban },
    { label: "Project collaborators", value: stats.collaborators, icon: Users },
    { label: "Administrators", value: stats.admins, icon: ShieldCheck },
  ];

  return <div className="space-y-4">
    <section className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> PLATFORM OPERATIONS</div>
        <h1>Admin panel</h1>
        <p>Review platform users, project ownership, and collaboration at a glance.</p>
      </div>
      <button type="button" className="button button-quiet" onClick={() => void load()} disabled={loading}>
        <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh
      </button>
    </section>

    {error && <div className="collaboration-message error" role="alert">{error}</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => <article key={label} className={`${panel} p-4`}>
        <div className="flex items-center justify-between text-xs text-[#a8abba]"><span>{label}</span><Icon size={17} /></div>
        <strong className="mt-3 block text-2xl font-semibold text-[#f3f3f8]">{loading ? "—" : value.toLocaleString()}</strong>
      </article>)}
    </div>

    <section className={`${panel} table-panel`}>
      <div className="panel-heading"><div><span className="section-kicker">ACCOUNT DIRECTORY</span><h2>Users</h2></div></div>
      {loading ? <p className="panel-copy">Loading users…</p> : data?.users.length ? <div className="table-scroll"><table>
        <thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>CREATED</th></tr></thead>
        <tbody>{data.users.map((user) => <tr key={user.id}>
          <td><b>{user.full_name}</b><small className="block text-[#9295a5]">{user.email}</small></td>
          <td>{user.role}</td><td>{user.is_active ? "Active" : "Inactive"}</td>
          <td>{new Date(user.created_at).toLocaleDateString()}</td>
        </tr>)}</tbody>
      </table></div> : <p className="panel-copy">No users found.</p>}
    </section>

    <section className={`${panel} table-panel`}>
      <div className="panel-heading"><div><span className="section-kicker">WORKSPACE DIRECTORY</span><h2>Projects and collaborators</h2></div></div>
      {loading ? <p className="panel-copy">Loading projects…</p> : data?.projects.length ? <div className="table-scroll"><table>
        <thead><tr><th>PROJECT</th><th>OWNER</th><th>COLLABORATORS</th><th>CREATED</th></tr></thead>
        <tbody>{data.projects.map((project) => <tr key={project.id}>
          <td><b>{project.name}</b></td>
          <td>{project.owner_name}<small className="block text-[#9295a5]">{project.owner_email}</small></td>
          <td>{project.collaborators}</td><td>{new Date(project.created_at).toLocaleDateString()}</td>
        </tr>)}</tbody>
      </table></div> : <p className="panel-copy">No projects found.</p>}
    </section>
  </div>;
}
