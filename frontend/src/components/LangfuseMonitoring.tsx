import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Coins,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/backend-api";

type Observation = {
  id: string;
  traceId?: string;
  type?: string;
  name?: string;
  traceName?: string;
  startTime?: string;
  endTime?: string;
  model?: string;
  level?: string;
  statusMessage?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  inputUsage?: number | null;
  outputUsage?: number | null;
  totalUsage?: number | null;
  usageDetails?: Record<string, number> | null;
  totalCost?: number | string | null;
  costDetails?: Record<string, number> | null;
  latency?: number | null;
};

type DashboardResponse = {
  configured: boolean;
  langfuse_url: string;
  days: number;
  observations: Observation[];
  truncated: boolean;
};

const panel = "rounded-xl border border-[#353846] bg-[#20222b]";

function numeric(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function tokenCount(item: Observation): number {
  return numeric(item.totalUsage ?? item.usageDetails?.["total"] ??
    (numeric(item.inputUsage ?? item.usageDetails?.["input"]) + numeric(item.outputUsage ?? item.usageDetails?.["output"])));
}

function cost(item: Observation): number {
  return numeric(item.totalCost ?? item.costDetails?.["total"]);
}

function pretty(value: unknown): string {
  if (value == null || value === "") return "No data recorded";
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2); }
    catch { return value; }
  }
  return JSON.stringify(value, null, 2);
}

function duration(item: Observation): string {
  if (!item.startTime || !item.endTime) return "—";
  const elapsed = Math.max(0, new Date(item.endTime).getTime() - new Date(item.startTime).getTime());
  return elapsed < 1000 ? `${elapsed} ms` : `${(elapsed / 1000).toFixed(2)} s`;
}

function formatCost(value: number): string {
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(3)}`;
}

function Stat({ label, value, helper, icon: Icon, tint }: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Activity;
  tint: string;
}) {
  return <article className={`${panel} relative overflow-hidden p-4`}>
    <div className="flex items-center justify-between gap-3 text-[11px] text-[#a8abba]">
      <span>{label}</span><span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}><Icon size={16} /></span>
    </div>
    <strong className="mt-3 block text-2xl font-semibold tracking-tight text-[#f3f3f8]">{value}</strong>
    <small className="mt-1 block text-[10px] text-[#858898]">{helper}</small>
    <span className="absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r from-[#9279df]/70 to-transparent" />
  </article>;
}

export function LangfuseMonitoring({ token }: { token: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api<DashboardResponse>(`/api/v1/observability/langfuse?days=${days}`, token);
      setData(response);
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Langfuse data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, token]);

  useEffect(() => { void load(); }, [load]);

  const observations = data?.observations ?? [];
  const models = useMemo(() => [...new Set(observations.map((item) => item.model).filter((model): model is string => Boolean(model)))].sort((a, b) => a.localeCompare(b)), [observations]);
  const filtered = useMemo(() => observations.filter((item) => {
    const matchesModel = modelFilter === "all" || item.model === modelFilter;
    const haystack = [item.name, item.traceName, item.model, item.traceId, item.metadata?.["request_id"]]
      .map((part) => String(part ?? "")).join(" ").toLowerCase();
    return matchesModel && haystack.includes(search.toLowerCase());
  }), [modelFilter, observations, search]);

  const stats = useMemo(() => {
    const errors = observations.filter((item) => item.level?.toUpperCase() === "ERROR").length;
    return {
      calls: observations.length,
      traces: new Set(observations.map((item) => item.traceId).filter(Boolean)).size,
      tokens: observations.reduce((sum, item) => sum + tokenCount(item), 0),
      cost: observations.reduce((sum, item) => sum + cost(item), 0),
      errors,
      errorRate: observations.length ? (errors / observations.length) * 100 : 0,
    };
  }, [observations]);

  const trend = useMemo(() => {
    const byDate = new Map<string, { label: string; tokens: number; calls: number }>();
    for (const item of observations) {
      if (!item.startTime) continue;
      const date = new Date(item.startTime);
      const key = days <= 1
        ? `${date.getHours().toString().padStart(2, "0")}:00`
        : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const point = byDate.get(key) ?? { label: key, tokens: 0, calls: 0 };
      point.tokens += tokenCount(item);
      point.calls += 1;
      byDate.set(key, point);
    }
    return [...byDate.values()];
  }, [days, observations]);

  const modelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of observations) {
      const model = item.model || "Unknown model";
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }
    return [...counts.entries()].map(([model, calls]) => ({ model, calls })).sort((a, b) => b.calls - a.calls);
  }, [observations]);

  return <div className="space-y-4">
    <section className="page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> OPERATIONS / AI OBSERVABILITY</div>
        <h1>Langfuse monitoring</h1>
        <p>Generation traces, provider usage, model cost, and errors from your AI pipeline.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="langfuse-range">Time range</label>
        <select id="langfuse-range" className="h-[34px] rounded-md border border-[#454857] bg-[#292b35] px-3 text-[11px] text-[#e5e6ee]" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
        </select>
        <button type="button" className="button button-quiet" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
        {data?.configured && <a className="button button-quiet" href={data.langfuse_url} target="_blank" rel="noreferrer">Open Langfuse <ExternalLink size={14} /></a>}
      </div>
    </section>

    {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}

    {!loading && data && !data.configured && <section className={`${panel} p-6`}>
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#302b42] text-[#c0aafa]"><Sparkles size={20} /></span>
        <h2 className="mt-4 text-base font-semibold text-[#f1f0f6]">Connect your Langfuse project</h2>
        <p className="mt-2 text-sm leading-6 text-[#a1a4b2]">Add your Langfuse project keys to the root <code className="rounded bg-[#2c2e38] px-1.5 py-0.5 text-[#d7caff]">.env</code> file and enable tracing. The keys stay on the server and are never sent to the browser.</p>
        <div className="mt-4 rounded-lg border border-[#373947] bg-[#191a21] p-4 text-left font-mono text-[11px] leading-6 text-[#c6c8d3]">
          <div>LANGFUSE_ENABLED=true</div><div>LANGFUSE_PUBLIC_KEY=pk-lf-…</div><div>LANGFUSE_SECRET_KEY=sk-lf-…</div>
        </div>
        <p className="mt-3 text-[11px] text-[#858898]">Restart the backend and AI engine after adding the keys. Generate an artifact to create your first trace.</p>
      </div>
    </section>}

    {data?.configured && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="Model calls" value={stats.calls.toLocaleString()} helper={`${stats.traces.toLocaleString()} distinct traces · ${days}d`} icon={Activity} tint="bg-[#302b42] text-[#c0aafa]" />
        <Stat label="Tokens used" value={stats.tokens.toLocaleString()} helper="Across returned generation calls" icon={Sparkles} tint="bg-[#293544] text-[#94bcff]" />
        <Stat label="Estimated cost" value={formatCost(stats.cost)} helper="Provider-reported Langfuse cost" icon={Coins} tint="bg-[#3b3327] text-[#f2c47a]" />
        <Stat label="Errors" value={stats.errors.toLocaleString()} helper={`${stats.errorRate.toFixed(1)}% of calls`} icon={AlertTriangle} tint="bg-[#402a31] text-[#ffafb6]" />
        <Stat label="Models" value={models.length.toLocaleString()} helper="Distinct providers/models" icon={Bot} tint="bg-[#273a32] text-[#9ce0bb]" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <section className={`${panel} p-4 xl:col-span-2`}>
          <div className="mb-4 flex items-start justify-between gap-3"><div><span className="section-kicker">USAGE OVER TIME</span><h2 className="mt-1 text-sm font-semibold text-[#eff0f5]">Token volume</h2></div><span className="rounded-md bg-[#302b42] px-2 py-1 text-[10px] text-[#c9b8ff]">{stats.tokens.toLocaleString()} total</span></div>
          {trend.length ? <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs><linearGradient id="langfuseTokensFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke="#383a46" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#858898", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#858898", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#20222b", border: "1px solid #454857", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#e7e7ed" }} />
              <Area type="monotone" dataKey="tokens" name="Tokens" stroke="#af96ff" strokeWidth={2} fill="url(#langfuseTokensFill)" />
            </AreaChart></ResponsiveContainer>
          </div> : <div className="grid h-56 place-items-center text-xs text-[#878a99]">No token usage in this period yet.</div>}
        </section>
        <section className={`${panel} p-4`}>
          <div className="mb-4"><span className="section-kicker">MODEL MIX</span><h2 className="mt-1 text-sm font-semibold text-[#eff0f5]">Calls by model</h2></div>
          {modelCounts.length ? <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={modelCounts} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#383a46" strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#858898", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="model" width={110} tick={{ fill: "#b9bbc8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#20222b", border: "1px solid #454857", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="calls" name="Calls" fill="#a78bfa" radius={[0, 5, 5, 0]} />
            </BarChart></ResponsiveContainer>
          </div> : <div className="grid h-56 place-items-center text-xs text-[#878a99]">No model data recorded yet.</div>}
        </section>
      </div>

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#393b47] p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><span className="section-kicker">TRACE EXPLORER</span><h2 className="mt-1 text-sm font-semibold text-[#eff0f5]">Generation calls <span className="ml-1 rounded-full bg-[#302b42] px-2 py-0.5 text-[10px] text-[#c9b8ff]">{filtered.length}</span></h2></div>
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-[#424553] bg-[#191a21] px-3 text-[#858898] lg:w-64"><Search size={14} /><input aria-label="Search traces" className="min-w-0 flex-1 bg-transparent text-xs text-[#e7e7ed] outline-none placeholder:text-[#777a89]" placeholder="Model, trace, request ID…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="sr-only" htmlFor="model-filter">Filter by model</label><select id="model-filter" className="h-9 rounded-md border border-[#424553] bg-[#191a21] px-3 text-xs text-[#e7e7ed]" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="all">All models</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select>
          <span className="text-[10px] text-[#858898]">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ""}</span>
        </div>
        {loading ? <div className="grid min-h-48 place-items-center text-xs text-[#9598a7]"><span className="flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading Langfuse observations…</span></div>
          : filtered.length === 0 ? <div className="grid min-h-48 place-items-center px-4 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#302b42] text-[#bba7f5]"><Activity size={18} /></span><h3 className="mt-3 text-sm font-medium text-[#e7e7ed]">No matching generations</h3><p className="mt-1 text-xs text-[#8d90a0]">Try another time range or generate an artifact to send a trace.</p></div></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-[#393b47] text-[9px] uppercase tracking-wider text-[#858898]"><th className="px-4 py-3 font-medium">Generation</th><th className="px-4 py-3 font-medium">Model</th><th className="px-4 py-3 text-right font-medium">Tokens</th><th className="px-4 py-3 text-right font-medium">Cost</th><th className="px-4 py-3 text-right font-medium">Duration</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3" /></tr></thead>
            <tbody>{filtered.map((item) => {
              const failed = item.level?.toUpperCase() === "ERROR";
              const expanded = expandedId === item.id;
              return <FragmentRow key={item.id} item={item} failed={failed} expanded={expanded} onToggle={() => setExpandedId(expanded ? null : item.id)} />;
            })}</tbody>
          </table></div>}
        {data.truncated && <div className="border-t border-[#393b47] px-4 py-2 text-[10px] text-[#d7b879]">Showing the newest 5,000 observations. Narrow the time range to inspect older calls.</div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#393b47] px-4 py-3 text-[10px] text-[#858898]"><span>Generation observations from the selected {days}-day window</span><span className="flex items-center gap-1"><Timer size={12} /> Auto-refresh is off</span></div>
      </section>
    </>}
  </div>;
}

function FragmentRow({ item, failed, expanded, onToggle }: { item: Observation; failed: boolean; expanded: boolean; onToggle: () => void }) {
  const rowTitle = item.traceName || item.name || "LLM generation";
      const requestId = item.metadata?.["request_id"];
  return <>
    <tr className="cursor-pointer border-b border-[#333541] text-[11px] text-[#c5c6d1] hover:bg-[#292b35]" onClick={onToggle} aria-expanded={expanded}>
      <td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium text-[#e5e6ee]">{rowTitle}</div><div className="mt-1 truncate font-mono text-[9px] text-[#828594]">{requestId ? `Request ${requestId}` : item.traceId || item.id}</div></td>
      <td className="px-4 py-3"><span className="rounded bg-[#302b42] px-2 py-1 text-[10px] text-[#cbbcff]">{item.model || "Unknown"}</span></td>
      <td className="px-4 py-3 text-right tabular-nums">{tokenCount(item).toLocaleString()}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatCost(cost(item))}</td>
      <td className="px-4 py-3 text-right tabular-nums">{duration(item)}</td>
      <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-[9px] ${failed ? "bg-[#402a31] text-[#ffafb6]" : "bg-[#273a32] text-[#9ce0bb]"}`}>{failed ? "Error" : "Success"}</span></td>
      <td className="whitespace-nowrap px-4 py-3 text-[#989aa8]">{item.startTime ? new Date(item.startTime).toLocaleString() : "—"}</td>
      <td className="px-4 py-3 text-right"><button type="button" className="grid h-7 w-7 place-items-center rounded text-[#9ea0ad] hover:bg-[#383a46] hover:text-white" aria-label={expanded ? "Collapse trace details" : "Expand trace details"} onClick={(event) => { event.stopPropagation(); onToggle(); }}><ArrowUpRight size={14} className={expanded ? "rotate-90" : ""} /></button></td>
    </tr>
    {expanded && <tr className="border-b border-[#393b47] bg-[#191a21]"><td colSpan={8} className="p-4"><div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <Detail label="Model input" content={item.input} />
      <Detail label="Model output" content={item.output} />
      <div className="rounded-lg border border-[#363845] bg-[#20222b] p-3 text-[10px] text-[#a8abba]">Trace <code className="ml-1 break-all text-[#d1c6f4]">{item.traceId || "—"}</code><span className="mx-2 text-[#555766]">·</span>Observation <code className="break-all text-[#d1c6f4]">{item.id}</code>{item.statusMessage && <p className="mt-2 text-[#ffafb6]">{item.statusMessage}</p>}</div>
      <div className="rounded-lg border border-[#363845] bg-[#20222b] p-3 text-[10px] text-[#a8abba]">Input tokens <b className="ml-1 text-[#e7e7ed]">{numeric(item.inputUsage ?? item.usageDetails?.["input"]).toLocaleString()}</b><span className="mx-3 text-[#555766]">·</span>Output tokens <b className="ml-1 text-[#e7e7ed]">{numeric(item.outputUsage ?? item.usageDetails?.["output"]).toLocaleString()}</b></div>
    </div></td></tr>}
  </>;
}

function Detail({ label, content }: { label: string; content: unknown }) {
  return <div className="min-w-0 rounded-lg border border-[#363845] bg-[#20222b]">
    <div className="border-b border-[#363845] px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-[#9699a8]">{label}</div>
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[10px] leading-5 text-[#d1d2dc]">{pretty(content)}</pre>
  </div>;
}
