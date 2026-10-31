import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowDownToLine, ArrowRight, Bell, BookOpen, Check, ChevronDown, CircleHelp, Clock3, Command, Copy, Download, FileText, FolderKanban, Gauge, Layers3, LogOut, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { api, apiUrl, type Artifact, type Project, type Requirement, type User } from "@/lib/backend-api";
import { GenerateArtifactModal, type ArtifactType } from "@/components/generate-artifact-modal";

const tokenKey = "sprintsmith_access_token";
const navItems = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "requirements", label: "Requirements", icon: FileText },
  { id: "artifacts", label: "Artifacts", icon: Layers3 },
  { id: "activity", label: "Activity", icon: Activity },
] as const;
type Page = (typeof navItems)[number]["id"];
export function Workspace() {
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem(tokenKey) || "");
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [page, setPage] = useState<Page>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [requirementText, setRequirementText] = useState("");
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [showRawArtifact, setShowRawArtifact] = useState(false);
  const [search, setSearch] = useState("");

  const loadWorkspace = useCallback(async (authToken: string, selectedId?: string) => {
    const [me, projectList] = await Promise.all([
      api<User>("/api/v1/auth/me", authToken),
      api<Project[]>("/api/v1/projects", authToken),
    ]);
    setUser(me);
    setProjects(projectList);
    const selected = projectList.find((item) => item.id === selectedId) ?? projectList[0] ?? null;
    setProject(selected);
    if (selected) {
      const [reqs, arts] = await Promise.all([
        api<Requirement[]>(`/api/v1/projects/${selected.id}/requirements`, authToken),
        api<Artifact[]>(`/api/v1/projects/${selected.id}/artifacts`, authToken),
      ]);
      setRequirements(reqs);
      setArtifacts(arts);
    } else { setRequirements([]); setArtifacts([]); }
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadWorkspace(token).catch((e: unknown) => {
      if (!active) return;
      setError(e instanceof Error ? e.message : "Could not load workspace");
      if (/401|unauthorized|invalid token/i.test(String(e))) signOut();
    });
    return () => { active = false; };
  }, [token, loadWorkspace]);

  function signOut() {
    localStorage.removeItem(tokenKey);
    setToken(""); setUser(null); setProjects([]); setProject(null); setRequirements([]); setArtifacts([]);
  }

  async function refresh() {
    if (!token) return;
    setBusy(true); setError("");
    try { await loadWorkspace(token, project?.id); setNotice("Workspace refreshed"); }
    catch (e) { setError(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setBusy(false); }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || ""); const password = String(form.get("password") || "");
    try {
      if (authMode === "register") {
        await api<User>("/api/v1/auth/register", undefined, { method: "POST", body: JSON.stringify({ email, password, full_name: form.get("full_name") }) });
      }
      const result = await api<{ access_token: string }>("/api/v1/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem(tokenKey, result.access_token); setToken(result.access_token);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token) return;
    setBusy(true); setError("");
    try {
      const created = await api<Project>("/api/v1/projects", token, { method: "POST", body: JSON.stringify({ name: projectName, description: projectDescription }) });
      setProjectName(""); setProjectDescription(""); setShowCreate(false);
      await loadWorkspace(token, created.id); setNotice("Project created");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create project"); }
    finally { setBusy(false); }
  }

  async function chooseProject(id: string) {
    if (!token) return;
    const next = projects.find((item) => item.id === id); if (!next) return;
    setProject(next); setBusy(true); setError("");
    try {
      const [reqs, arts] = await Promise.all([
        api<Requirement[]>(`/api/v1/projects/${id}/requirements`, token), api<Artifact[]>(`/api/v1/projects/${id}/artifacts`, token),
      ]);
      setRequirements(reqs); setArtifacts(arts); setPage("overview");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open project"); }
    finally { setBusy(false); }
  }

  async function ingest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || !project) return;
    setBusy(true); setError("");
    try {
      let jobId: string | undefined;
      if (requirementFile) {
        const data = new FormData(); data.set("file", requirementFile); data.set("doc_type", "requirement");
        const response = await api<{ ingest_job_id: string }>(`/api/v1/projects/${project.id}/requirements`, token, { method: "POST", body: data });
        jobId = response.ingest_job_id;
      } else {
        const response = await api<{ ingest_job_id: string }>(`/api/v1/projects/${project.id}/requirements/text`, token, { method: "POST", body: JSON.stringify({ content: requirementText, doc_type: "requirement" }) });
        jobId = response.ingest_job_id;
      }
      setRequirementText(""); setRequirementFile(null); setNotice("Requirement accepted. Indexing has started...");
      let indexed = !jobId;
      if (jobId) {
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
          const job = await api<{ status: string; error_message?: string | null }>(`/api/v1/ingest-jobs/${jobId}`, token);
          if (job.status === "done") { indexed = true; break; }
          if (job.status === "failed") throw new Error(job.error_message || "Requirement indexing failed.");
        }
      }
      await loadWorkspace(token, project.id);
      setNotice(indexed ? "Requirement indexed and ready." : "Requirement submitted. Indexing is still in progress; refresh the workspace shortly.");
      setPage("requirements");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit requirement"); }
    finally { setBusy(false); }
  }

  async function generateArtifact(artifactType: ArtifactType, requirementText: string) {
    if (!token || !project) return;
    setBusy(true); setError("");
    try {
      const created = await api<Artifact>(`/api/v1/projects/${project.id}/generate`, token, { method: "POST", body: JSON.stringify({ artifact_type: artifactType, requirement_text: requirementText }) });
      setArtifacts((items) => [created, ...items]); setSelectedArtifact(created); setShowGenerate(false); setNotice("Artifact generated successfully"); setPage("artifacts");
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setBusy(false); }
  }

  const filteredArtifacts = useMemo(() => artifacts.filter((a) => `${a.title} ${a.artifact_type}`.toLowerCase().includes(search.toLowerCase())), [artifacts, search]);
  const recentArtifacts = artifacts.slice(0, 5);
  const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (!token) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} busy={busy} error={error} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand"><span className="brand-mark"><Command size={18} /></span><span>SprintSmith</span><span className="brand-tag">WORKSPACE</span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <button className="project-switcher" onClick={() => setShowCreate(true)}><span className="project-icon"><FolderKanban size={16} /></span><span className="project-current">{project?.name ?? "Select a project"}<small>{project ? "Project workspace" : "Get started"}</small></span><ChevronDown size={15} /></button>
      {project && <div className="project-list">{projects.map((item) => <button key={item.id} className={`project-option ${item.id === project.id ? "active" : ""}`} onClick={() => chooseProject(item.id)}><span className="project-dot" />{item.name}</button>)}</div>}
      <div className="sidebar-label nav-caption">PROJECT</div>
      <nav className="side-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setPage(id)} className={`nav-item ${page === id ? "selected" : ""}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "requirements" && requirements.length > 0 && <span className="nav-count">{requirements.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="system-card"><span className="pulse-dot" /><div><b>API connected</b><small>{apiUrl.replace(/^https?:\/\//, "")}</small></div><Check size={14} /></div><button className="nav-item subtle"><Settings2 size={17} /><span>Settings</span></button><button className="nav-item subtle"><CircleHelp size={17} /><span>Help center</span></button><div className="user-card"><div className="avatar">{(user?.full_name || user?.email || "U").slice(0, 1).toUpperCase()}</div><div className="user-meta"><b>{user?.full_name ?? "Workspace member"}</b><small>{user?.role ?? "member"}</small></div><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>Projects</span><span className="crumb-slash">/</span><b>{project?.name ?? "Workspace"}</b><span className="status-pill"><i /> Live</span></div><div className="top-actions"><label className="top-search"><Search size={15} /><input placeholder="Search workspace" value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>ÃƒÂ¢Ã…â€™Ã‹Å“ K</kbd></label><button className="icon-button top-icon" title="Refresh" onClick={refresh}><RefreshCw size={17} className={busy ? "spin" : ""} /></button><button className="icon-button top-icon" title="Notifications"><Bell size={17} /><i className="notification-dot" /></button><div className="top-avatar">{(user?.full_name || "U").slice(0, 1).toUpperCase()}</div></div></header>
      <div className="content-wrap">
        {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
        {!project ? <EmptyProjects onCreate={() => setShowCreate(true)} /> : <>
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PROJECT CONSOLE</div><h1>{page === "overview" ? "Project overview" : page === "requirements" ? "Requirements" : page === "artifacts" ? "Generated artifacts" : "Activity"}</h1><p>{page === "overview" ? "A clear view of your SDLC workspace and recent progress." : page === "requirements" ? "Manage source documents and turn them into structured engineering outputs." : page === "artifacts" ? "Review and explore AI generated project deliverables." : "A timeline of work across this project."}</p></div><div className="heading-actions"><button className="button button-quiet" onClick={refresh}><RefreshCw size={15} /> Refresh</button><button className="button button-primary" onClick={() => setPage("requirements")}><Plus size={16} /> Add requirement</button></div></section>
          {page === "overview" && <>
            <div className="metric-grid"><Metric label="Requirements" value={requirements.length} helper="Source documents" icon={FileText} color="amber" /><Metric label="Artifacts" value={artifacts.length} helper="Generated outputs" icon={Layers3} color="purple" /><Metric label="Project health" value={requirements.length ? "Active" : "Ready"} helper={requirements.length ? "Pipeline operational" : "Awaiting first input"} icon={ShieldCheck} color="green" /><Metric label="Last updated" value={artifacts[0] ? formatDate(artifacts[0].created_at) : "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"} helper="Most recent artifact" icon={Clock3} color="blue" /></div>
            <div className="dashboard-grid"><section className="panel pipeline-panel"><div className="panel-heading"><div><span className="section-kicker">WORKFLOW</span><h2>Project pipeline</h2></div><span className="live-label"><i /> LIVE STATUS</span></div><div className="pipeline"><PipelineStep icon={FileText} label="Requirements" count={requirements.length} state={requirements.length ? "complete" : "empty"} /><div className="pipeline-connector" /><PipelineStep icon={Sparkles} label="Generation" count={artifacts.length} state={artifacts.length ? "complete" : "empty"} /><div className="pipeline-connector" /><PipelineStep icon={Layers3} label="Artifacts" count={artifacts.length} state={artifacts.length ? "complete" : "empty"} /></div><div className="pipeline-foot"><span><span className="pulse-dot" />{requirements.length ? "Workspace is processing normally" : "Add a requirement to begin"}</span><button className="text-button" onClick={() => setPage("requirements")}>View requirements <ArrowRight size={14} /></button></div></section>
              <section className="panel activity-panel"><div className="panel-heading"><div><span className="section-kicker">PROJECT SNAPSHOT</span><h2>At a glance</h2></div><button className="icon-button" onClick={refresh}><RefreshCw size={15} /></button></div><div className="snapshot-row"><span className="snapshot-icon amber-bg"><FileText size={16} /></span><div><b>Source documents</b><small>Requirements in this project</small></div><strong>{requirements.length}</strong></div><div className="snapshot-row"><span className="snapshot-icon purple-bg"><Sparkles size={16} /></span><div><b>AI deliverables</b><small>Generated artifacts</small></div><strong>{artifacts.length}</strong></div><div className="snapshot-row"><span className="snapshot-icon green-bg"><Activity size={16} /></span><div><b>Backend status</b><small>Connected to API gateway</small></div><strong className="healthy">Healthy</strong></div><div className="snapshot-foot">Project created {formatDate(project.created_at)}</div></section></div>
            <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">RECENT OUTPUT</span><h2>Latest artifacts</h2></div><button className="text-button" onClick={() => setPage("artifacts")}>View all <ArrowRight size={14} /></button></div><ArtifactTable items={recentArtifacts} onSelect={setSelectedArtifact} onPage={() => setPage("artifacts")} /></section>
          </>}
          {page === "requirements" && <><div className="requirements-actions-row"><div className="panel form-panel"><div className="panel-heading"><div><span className="section-kicker">SOURCE INPUT</span><h2>Add a requirement</h2></div><span className="panel-icon amber-bg"><Upload size={17} /></span></div><p className="panel-copy">Upload a document or paste requirement text. The backend will index it for generation.</p><form className="stack-form" onSubmit={ingest}><label className="field-label" htmlFor="requirement-text">Paste requirement text <span>10–50,000 characters</span></label><textarea id="requirement-text" className="text-area" value={requirementText} onChange={(e) => { setRequirementText(e.target.value); setRequirementFile(null); }} minLength={10} maxLength={50000} placeholder="Describe the product requirement, feature, or business need..." /><div className="or-divider"><span>OR UPLOAD DOCUMENT</span></div><label className="drop-zone"><input type="file" accept=".txt,.md,.pdf,.docx,.html,.csv" onChange={(e) => { setRequirementFile(e.target.files?.[0] ?? null); setRequirementText(""); }} /><Upload size={20} /><b>{requirementFile ? requirementFile.name : "Choose a file or drag it here"}</b><small>TXT, Markdown, PDF, DOCX up to 10 MB</small></label><button type="submit" className="button button-primary full-button" disabled={busy || (!requirementFile && requirementText.trim().length < 10)}>{busy ? <><span className="button-spinner" /> Submitting...</> : <><Plus size={16} /> Submit requirement</>}</button></form></div><button className="button button-primary generate-launch" onClick={() => setShowGenerate(true)}><Sparkles size={17} /> Generate Artifact <ArrowRight size={15} /></button></div><section className="panel requirements-list"><div className="panel-heading"><div><span className="section-kicker">PROJECT INPUTS</span><h2>Requirements <span className="count-badge">{requirements.length}</span></h2></div><button className="icon-button" onClick={refresh}><RefreshCw size={15} /></button></div><RequirementTable items={requirements} formatDate={formatDate} /></section></>}
          {page === "artifacts" && <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">GENERATED OUTPUT</span><h2>Artifacts <span className="count-badge">{artifacts.length}</span></h2></div><button className="button button-primary button-small" onClick={() => setPage("requirements")}><Sparkles size={15} /> New generation</button></div><ArtifactTable items={filteredArtifacts} onSelect={setSelectedArtifact} onPage={() => {}} /></section>}
          {page === "activity" && <section className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">AUDIT TRAIL</span><h2>Recent activity</h2></div><span className="status-pill"><i /> Live data</span></div><div className="timeline">{[...artifacts.map((a) => ({ label: `Generated ${a.artifact_type.replaceAll("_", " ")}`, detail: a.title, date: a.created_at, icon: Sparkles, tint: "purple-bg" })), ...requirements.map((r) => ({ label: "Requirement ingested", detail: r.filename, date: r.created_at, icon: FileText, tint: "amber-bg" }))].sort((a,b) => +new Date(b.date) - +new Date(a.date)).map((item, index) => <div className="timeline-item" key={`${item.label}-${item.date}-${index}`}><span className={`timeline-icon ${item.tint}`}><item.icon size={16} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><time>{formatDate(item.date)}</time></div>)}{!artifacts.length && !requirements.length && <EmptyState icon={Activity} title="No activity yet" text="Add a requirement or generate an artifact to see project activity here." />}</div></section>}
        </>}
        <footer className="page-footer"><span>SPRINTSMITH <span className="footer-sep">/</span> PROJECT WORKSPACE</span><span>API gateway <a href={apiUrl} target="_blank" rel="noreferrer">{apiUrl}</a></span></footer>
      </div>
    </main>
    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}><div className="modal"><div className="modal-heading"><div><span className="section-kicker">NEW WORKSPACE</span><h2>Create a project</h2></div><button className="icon-button" onClick={() => setShowCreate(false)}><X size={17} /></button></div><form className="stack-form" onSubmit={createProject}><label className="field-label" htmlFor="project-name">Project name</label><input id="project-name" className="text-input" value={projectName} onChange={(e) => setProjectName(e.target.value)} required maxLength={160} placeholder="e.g. Customer onboarding" /><label className="field-label" htmlFor="project-description">Description <span>Optional</span></label><textarea id="project-description" className="text-area short-area" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} maxLength={10000} placeholder="What is this project about?" /><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" disabled={busy || !projectName.trim()}>{busy ? "Creating..." : "Create project"}</button></div></form></div></div>}
    {showGenerate && <GenerateArtifactModal busy={busy} error={error} onClose={() => setShowGenerate(false)} onGenerate={generateArtifact} />}
    {selectedArtifact && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelectedArtifact(null); setShowRawArtifact(false); } }}><div className="modal artifact-modal"><div className="modal-heading"><div><div className="artifact-heading-meta"><span className="type-pill">{selectedArtifact.artifact_type.replaceAll("_", " ")}</span><span className="version-tag">VERSION {selectedArtifact.version}</span><span className="artifact-created">Created {formatDate(selectedArtifact.created_at)}</span></div><h2>{selectedArtifact.title}</h2></div><button className="icon-button" onClick={() => { setSelectedArtifact(null); setShowRawArtifact(false); }}><X size={17} /></button></div><div className="artifact-toolbar"><span>{showRawArtifact ? "Source JSON" : "Formatted document"}</span><div><button className="button button-quiet button-small" onClick={() => setShowRawArtifact((value) => !value)}>{showRawArtifact ? "Formatted view" : "View JSON"}</button><button className="button button-quiet button-small" onClick={() => { void navigator.clipboard.writeText(artifactToMarkdown(selectedArtifact)); setNotice("Formatted artifact copied"); }}><Copy size={13} /> Copy</button><button className="button button-quiet button-small" onClick={() => downloadArtifact(selectedArtifact)}><Download size={13} /> Export .md</button></div></div><div className="artifact-document-scroll">{showRawArtifact ? <pre className="artifact-json">{JSON.stringify(selectedArtifact.content, null, 2)}</pre> : <ArtifactDocument artifact={selectedArtifact} />}</div><div className="modal-actions"><button className="button button-quiet" onClick={() => { setSelectedArtifact(null); setShowRawArtifact(false); }}>Close</button></div></div></div>}
  </div>;
}

function AuthScreen({ mode, setMode, onSubmit, busy, error }: { mode: "login" | "register"; setMode: (value: "login" | "register") => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; error: string }) {
  return <div className="auth-screen"><div className="auth-glow" /><div className="auth-card"><a href="/" className="brand auth-brand"><span className="brand-mark"><Command size={18} /></span><span>SprintSmith</span></a><div className="auth-eyebrow"><span className="pulse-dot" /> ENGINEERING WORKSPACE</div><h1>{mode === "login" ? "Welcome back" : "Create your workspace"}</h1><p>{mode === "login" ? "Sign in to continue to your project console." : "Create an account to start organizing your SDLC."}</p>{error && <div className="auth-error">{error}</div>}<form className="stack-form auth-form" onSubmit={onSubmit}>{mode === "register" && <><label className="field-label" htmlFor="full-name">Full name</label><input className="text-input" id="full-name" name="full_name" autoComplete="name" required minLength={1} placeholder="Your name" /></>}<label className="field-label" htmlFor="email">Email address</label><input className="text-input" id="email" type="email" name="email" autoComplete="email" required placeholder="you@company.com" /><label className="field-label" htmlFor="password">Password</label><input className="text-input" id="password" type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="At least 8 characters" /><button className="button button-primary full-button" disabled={busy}>{busy ? "Connecting..." : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={16} /></button></form><div className="auth-switch">{mode === "login" ? "New to SprintSmith?" : "Already have an account?"}<button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create account" : "Sign in"}</button></div><div className="auth-api"><span className="pulse-dot" /> Connecting to <code>{apiUrl}</code></div></div><div className="auth-foot">BUILT FOR THE WORK BEHIND GREAT SOFTWARE</div></div>;
}

function Metric({ label, value, helper, icon: Icon, color }: { label: string; value: string | number; helper: string; icon: typeof FileText; color: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}-bg`}><Icon size={17} /></span></div><strong>{value}</strong><small>{helper}</small><div className={`metric-accent ${color}`} /></div>;
}
function PipelineStep({ icon: Icon, label, count, state }: { icon: typeof FileText; label: string; count: number; state: string }) {
  return <div className="pipeline-step"><span className={`step-icon ${state === "complete" ? "step-done" : ""}`}><Icon size={19} /></span><div><b>{label}</b><small>{count} {count === 1 ? "item" : "items"}</small></div>{state === "complete" && <Check className="step-check" size={15} />}</div>;
}
function ArtifactTable({ items, onSelect, onPage }: { items: Artifact[]; onSelect: (artifact: Artifact) => void; onPage: () => void }) {
  return items.length ? <div className="table-scroll"><table><thead><tr><th>ARTIFACT</th><th>TYPE</th><th>VERSION</th><th>CREATED</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onSelect(item)}><td><div className="table-title"><span className="table-file-icon"><FileText size={15} /></span><b>{item.title}</b></div></td><td><span className="type-pill">{item.artifact_type.replaceAll("_", " ")}</span></td><td><span className="version-tag">v{item.version}</span></td><td>{new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td><td><button className="row-arrow" onClick={(e) => { e.stopPropagation(); onSelect(item); }}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={Layers3} title="No artifacts yet" text="Generate your first structured deliverable from a requirement." action={<button className="text-button" onClick={onPage}>Go to generation <ArrowRight size={14} /></button>} />;
}
function RequirementTable({ items, formatDate }: { items: Requirement[]; formatDate: (value: string) => string }) {
  return items.length ? <div className="req-list">{items.map((item) => <div className="req-row" key={item.id}><span className="table-file-icon"><FileText size={15} /></span><div className="req-title"><b>{item.filename}</b><small>{item.doc_type.replaceAll("_", " ")}</small></div><span className="chunk-count">{item.chunks_indexed} chunks</span><time>{formatDate(item.created_at)}</time><span className="complete-check"><Check size={14} /></span></div>)}</div> : <EmptyState icon={BookOpen} title="No requirements added" text="Paste text or upload a document to build your project's source of truth." />;
}
type ArtifactData = Record<string, unknown>;
function asRecord(value: unknown): ArtifactData { return value && typeof value === "object" && !Array.isArray(value) ? value as ArtifactData : {}; }
function asList(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function asText(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function humanize(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }

function ArtifactDocument({ artifact }: { artifact: Artifact }) {
  const data = asRecord(artifact.content);
  if (artifact.artifact_type === "user_story") return <div className="artifact-document">{asList(data.stories).map((value, index) => { const story = asRecord(value); return <article className="artifact-card story-card" key={asText(story.id) || index}><div className="artifact-card-top"><span className="artifact-id">{asText(story.id) || `STORY ${index + 1}`}</span><span className={`priority-badge priority-${asText(story.priority).toLowerCase()}`}>{asText(story.priority) || "Unprioritized"}</span></div><h3>{asText(story.title) || "User story"}</h3><p className="story-copy">{asText(story.story)}</p><div className="artifact-meta-grid"><ArtifactMeta label="Actor" value={story.actor} /><ArtifactMeta label="Estimate" value={story.story_points ? `${asText(story.story_points)} points` : "Not estimated"} /><ArtifactMeta label="Category" value={story.category} /><ArtifactMeta label="Sprint" value={story.sprint_candidate ? `Sprint ${asText(story.sprint_candidate)}` : "Unassigned"} /></div><ArtifactBullets title="Acceptance criteria" values={story.acceptance_criteria_summary} /><ArtifactBullets title="Dependencies" values={story.dependencies} emptyText="No dependencies" /></article>; })}{!asList(data.stories).length && <GenericArtifactContent data={data} />}</div>;
  if (artifact.artifact_type === "acceptance_criteria") return <div className="artifact-document"><div className="artifact-context"><span className="section-kicker">FOR USER STORY</span><h3>{asText(data.user_story_title) || artifact.title}</h3></div>{asList(data.criteria).map((value, index) => { const item = asRecord(value); return <article className="artifact-card criteria-card" key={index}><div className="artifact-card-top"><span className="artifact-id">CRITERION {String(index + 1).padStart(2, "0")}</span><span className={`type-pill case-${asText(item.case_type).toLowerCase()}`}>{asText(item.case_type) || "Scenario"}</span></div><div className="bdd-row"><span>GIVEN</span><p>{asText(item.given)}</p></div><div className="bdd-row"><span>WHEN</span><p>{asText(item.when)}</p></div><div className="bdd-row"><span>THEN</span><p>{asText(item.then)}</p></div></article>; })}{!asList(data.criteria).length && <GenericArtifactContent data={data} />}</div>;
  if (artifact.artifact_type === "test_case") return <div className="artifact-document">{asList(data.cases).map((value, index) => { const item = asRecord(value); return <article className="artifact-card test-case-card" key={asText(item.id) || index}><div className="artifact-card-top"><span className="artifact-id">{asText(item.id) || `TEST ${String(index + 1).padStart(2, "0")}`}</span><span className={`type-pill case-${asText(item.category).toLowerCase()}`}>{asText(item.category) || "Test"}</span></div><h3>{asText(item.title) || `Test case ${index + 1}`}</h3><div className="test-steps"><b>TEST STEPS</b><ol>{asList(item.steps).map((step, stepIndex) => <li key={stepIndex}>{asText(step)}</li>)}</ol></div><div className="result-block"><span>EXPECTED RESULT</span><p>{asText(item.expected_result)}</p></div>{item.traceability && <div className="traceability-line"><span>TRACEABILITY</span><p>{asText(item.traceability)}</p></div>}</article>; })}{!asList(data.cases).length && <GenericArtifactContent data={data} />}</div>;
  if (artifact.artifact_type === "sprint_plan") {
    const items = asList(data.items).map(asRecord);
    const sprintIds = [...new Set(items.map((item) => asText(item.sprint) || "1"))].sort((a, b) => Number(a) - Number(b));
    const totalPoints = items.reduce((sum, item) => sum + (Number(item.story_points) || 0), 0);
    return <div className="artifact-document"><div className="artifact-summary-strip"><ArtifactMeta label="Planned stories" value={items.length} /><ArtifactMeta label="Total points" value={totalPoints} /><ArtifactMeta label="Velocity / sprint" value={data.assumed_velocity_points_per_sprint || "Ã¢â‚¬â€"} /></div>{sprintIds.map((sprint) => <section className="artifact-section" key={sprint}><div className="artifact-section-heading"><span className="section-kicker">SPRINT {sprint.padStart(2, "0")}</span><span>{items.filter((item) => (asText(item.sprint) || "1") === sprint).length} stories</span></div><div className="sprint-items">{items.filter((item) => (asText(item.sprint) || "1") === sprint).map((item, index) => <div className="sprint-item" key={`${asText(item.story_title)}-${index}`}><span className="sprint-item-bullet" /><div><b>{asText(item.story_title)}</b><small>{asText(item.effort_estimate_hours)} hours{asList(item.dependencies).length ? ` Ã‚Â· ${asList(item.dependencies).length} dependencies` : ""}</small></div><span className="points-pill">{asText(item.story_points)} pts</span></div>)}</div></section>)}<ArtifactBullets title="Critical path" values={data.critical_path} emptyText="No critical path identified" />{!items.length && <GenericArtifactContent data={data} />}</div>;
  }
  if (artifact.artifact_type === "architecture") return <div className="artifact-document"><div className="architecture-hero"><span className="section-kicker">PROPOSED PATTERN</span><h3>{asText(data.pattern) || "Solution architecture"}</h3>{data.rationale && <p>{asText(data.rationale)}</p>}</div><ArtifactChipSection title="Technology recommendations" values={data.technology_recommendations} /><section className="artifact-section"><div className="artifact-section-heading"><span className="section-kicker">COMPONENTS</span><span>{asList(data.components).length} components</span></div><div className="component-grid">{asList(data.components).map((value, index) => { const item = asRecord(value); return <article className="component-card" key={index}><span className="component-glyph"><Layers3 size={16} /></span><h4>{asText(item.name)}</h4><p>{asText(item.responsibility)}</p><span className="component-tech">{asText(item.technology)}</span></article>; })}</div></section>{data.data_flow && <ArchitectureFlow description={asText(data.data_flow)} components={asList(data.components)} />}<ArtifactBullets title="Security considerations" values={data.security_considerations} /></div>;
  if (artifact.artifact_type === "api_spec") return <div className="artifact-document">{asList(data.endpoints).map((value, index) => { const endpoint = asRecord(value); const method = asText(endpoint.method).toUpperCase() || "HTTP"; return <article className="artifact-card endpoint-card" key={`${method}-${asText(endpoint.path)}-${index}`}><div className="endpoint-heading"><span className={`method-badge method-${method.toLowerCase()}`}>{method}</span><code>{asText(endpoint.path)}</code></div><p className="endpoint-description">{asText(endpoint.description)}</p><FieldTable title="Request" fields={endpoint.request_schema} /><FieldTable title="Response" fields={endpoint.response_schema} />{asList(endpoint.error_codes).length > 0 && <div className="endpoint-errors"><b>ERROR RESPONSES</b>{asList(endpoint.error_codes).map((errorValue, errorIndex) => { const error = asRecord(errorValue); return <div key={errorIndex}><code>{asText(error.code)}</code><span>{asText(error.reason)}</span></div>; })}</div>}</article>; })}{!asList(data.endpoints).length && <GenericArtifactContent data={data} />}</div>;
  return <div className="artifact-document"><GenericArtifactContent data={data} /></div>;
}

function ArtifactMeta({ label, value }: { label: string; value: unknown }) { const display = asText(value); return <div className="artifact-meta"><span>{label}</span><b>{display || "Ã¢â‚¬â€"}</b></div>; }
function ArchitectureFlow({ description, components }: { description: string; components: unknown[] }) {
  const namedComponents = components.map(asRecord).map((item) => ({ name: asText(item.name), detail: asText(item.responsibility) })).filter((item) => item.name && description.toLowerCase().includes(item.name.toLowerCase())).sort((a, b) => description.toLowerCase().indexOf(a.name.toLowerCase()) - description.toLowerCase().indexOf(b.name.toLowerCase()));
  const uniqueNamed = namedComponents.filter((item, index) => namedComponents.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase()) === index);
  const explicitParts = description.split(/\s*(?:->|Ã¢â€ â€™|Ã¢Å¸Â¶|Ã¢â€¡â€™|Ã¢Å¾Å“|;|\n+)\s*|\s+(?:then|next|after that|followed by|finally)\s+/i).map((part) => part.trim().replace(/[.!]+$/, "")).filter(Boolean);
  const sentenceParts = description.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const steps = uniqueNamed.length > 1 ? uniqueNamed.map((item) => ({ title: item.name, detail: item.detail })) : (explicitParts.length > 1 ? explicitParts : sentenceParts).map((part, index) => ({ title: `Step ${index + 1}`, detail: part }));
  const hasSequence = uniqueNamed.length > 1 || explicitParts.length > 1 || sentenceParts.length > 1;
  return <section className="flow-block"><div className="flow-title-row"><div><span className="section-kicker">DATA FLOW</span><h4>{hasSequence ? "Request journey" : "Flow description"}</h4></div>{hasSequence && <span className="flow-direction">SEQUENCE</span>}</div>{hasSequence ? <div className="flow-diagram">{steps.map((step, index) => <div className="flow-segment" key={`${step.title}-${index}`}><article className="flow-node"><span className="flow-node-index">{String(index + 1).padStart(2, "0")}</span><div><b>{step.title}</b>{step.detail && step.detail !== step.title && <p>{step.detail}</p>}</div></article>{index < steps.length - 1 && <div className="flow-connector" aria-hidden="true"><span /><ArrowRight size={15} /></div>}</div>)}</div> : <div className="flow-single"><span className="flow-single-icon"><Activity size={16} /></span><p>{description}</p></div>}{hasSequence && <details className="flow-source"><summary>View original flow description</summary><p>{description}</p></details>}</section>;
}
function ArtifactBullets({ title, values, emptyText = "" }: { title: string; values: unknown; emptyText?: string }) { const items = asList(values); if (!items.length && !emptyText) return null; return <section className="artifact-subsection"><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={index}>{asText(item)}</li>)}</ul> : <p className="muted-copy">{emptyText}</p>}</section>; }
function ArtifactChipSection({ title, values }: { title: string; values: unknown }) { const items = asList(values); if (!items.length) return null; return <section className="artifact-subsection"><h4>{title}</h4><div className="artifact-chips">{items.map((item, index) => <span className="artifact-chip" key={index}>{asText(item)}</span>)}</div></section>; }
function FieldTable({ title, fields }: { title: string; fields: unknown }) { const items = asList(fields).map(asRecord); if (!items.length) return null; return <section className="field-table-section"><h4>{title} schema</h4><div className="table-scroll"><table className="schema-table"><thead><tr><th>FIELD</th><th>TYPE</th><th>REQUIRED</th><th>DESCRIPTION</th></tr></thead><tbody>{items.map((field, index) => <tr key={`${asText(field.name)}-${index}`}><td><code>{asText(field.name)}</code></td><td>{asText(field.type)}</td><td>{field.required === false ? "No" : "Yes"}</td><td>{asText(field.description) || "Ã¢â‚¬â€"}</td></tr>)}</tbody></table></div></section>; }
function GenericArtifactContent({ data, depth = 0 }: { data: ArtifactData; depth?: number }) { const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && value !== ""); if (!entries.length) return <p className="muted-copy">No structured content was returned for this artifact.</p>; return <div className={`generic-fields ${depth ? "nested-fields" : ""}`}>{entries.map(([key, value]) => <div className="generic-field" key={key}><h4>{humanize(key)}</h4>{Array.isArray(value) ? value.length && typeof value[0] === "object" ? <div className="generic-array">{value.map((item, index) => <div className="generic-array-card" key={index}><GenericArtifactContent data={asRecord(item)} depth={depth + 1} /></div>)}</div> : <ul>{value.map((item, index) => <li key={index}>{typeof item === "object" ? JSON.stringify(item) : asText(item)}</li>)}</ul> : value && typeof value === "object" ? <div className="generic-nested"><GenericArtifactContent data={asRecord(value)} depth={depth + 1} /></div> : <p>{asText(value)}</p>}</div>)}</div>; }

function artifactToMarkdown(artifact: Artifact): string {
  const lines = [`# ${artifact.title}`, `**Type:** ${humanize(artifact.artifact_type)}  `, `**Version:** ${artifact.version}`, ""];
  const append = (value: unknown, level: number) => {
    if (Array.isArray(value)) { value.forEach((item, index) => { if (item && typeof item === "object") { const record = asRecord(item); lines.push(`${"#".repeat(Math.min(level, 6))} ${asText(record.title || record.name || record.story_title) || `Item ${index + 1}`}`); append(record, level + 1); } else lines.push(`- ${asText(item)}`); }); return; }
    if (value && typeof value === "object") { Object.entries(asRecord(value)).forEach(([key, item]) => { if (item === null || item === undefined || item === "") return; if (Array.isArray(item) || (item && typeof item === "object")) { lines.push(`${"#".repeat(Math.min(level, 6))} ${humanize(key)}`); append(item, level + 1); } else lines.push(`**${humanize(key)}:** ${asText(item)}`); }); return; }
    lines.push(asText(value));
  };
  append(artifact.content, 2);
  return lines.join("\n");
}
function downloadArtifact(artifact: Artifact) { const blob = new Blob([artifactToMarkdown(artifact)], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${artifact.artifact_type}-${artifact.id}.md`; link.click(); URL.revokeObjectURL(url); }
function EmptyState({ icon: Icon, title, text, action }: { icon: typeof FileText; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><b>{title}</b><p>{text}</p>{action}</div>; }
function EmptyProjects({ onCreate }: { onCreate: () => void }) { return <div className="empty-projects"><span className="empty-icon large-empty"><FolderKanban size={24} /></span><span className="section-kicker">YOUR WORKSPACE</span><h1>Start with a project</h1><p>Create a project to organize requirements, generate deliverables, and track engineering work in one place.</p><button className="button button-primary" onClick={onCreate}><Plus size={16} /> Create your first project</button></div>; }
