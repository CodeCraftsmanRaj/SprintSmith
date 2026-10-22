import { shell } from "./shell";

const card = "rounded-lg bg-surface-container-low border border-outline-variant/30";
const chip = "font-label-sm text-label-sm px-1.5 py-0.5 rounded";

type Story = { id: string; title: string; pts: number; pri: string; tag: string; owner: string; trace: string };

const col = (title: string, icon: string, count: string, cap: string, stories: Story[], tone: string) => `
<div class="${card} flex flex-col">
  <div class="flex items-center justify-between px-space-md py-space-sm border-b border-outline-variant/30">
    <div class="flex items-center gap-space-xs"><span class="material-symbols-outlined text-[16px] ${tone}">${icon}</span>
    <span class="font-body-sm text-body-sm font-medium text-on-surface">${title}</span>
    <span class="${chip} bg-surface-container-highest text-on-surface-variant">${count}</span></div>
    <span class="font-label-sm text-label-sm text-outline">${cap}</span>
  </div>
  <div class="flex flex-col gap-space-sm p-space-sm">
  ${stories
    .map(
      (s) => `
    <div class="rounded bg-surface-container p-space-sm border border-outline-variant/20 hover:border-primary/40 transition-colors cursor-grab">
      <div class="flex items-center justify-between mb-1">
        <span class="font-label-sm text-label-sm text-primary">${s.id}</span>
        <span class="${chip} ${s.pri === "P0" ? "bg-error-container text-on-error-container" : s.pri === "P1" ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-highest text-on-surface-variant"}">${s.pri}</span>
      </div>
      <p class="font-body-sm text-body-sm text-on-surface mb-space-sm">${s.title}</p>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1">
          <span class="${chip} bg-surface-container-highest text-on-surface-variant">${s.tag}</span>
          <span class="${chip} bg-surface-container-lowest text-outline">${s.trace}</span>
        </div>
        <div class="flex items-center gap-space-xs">
          <span class="font-label-sm text-label-sm text-on-surface">${s.pts} pts</span>
          <span class="w-5 h-5 rounded-full bg-surface-container-highest flex items-center justify-center font-label-sm text-[9px] text-on-surface-variant">${s.owner}</span>
        </div>
      </div>
    </div>`,
    )
    .join("")}
  </div>
</div>`;

const stat = (label: string, value: string, sub: string, accent = "text-on-surface") => `
<div class="${card} p-space-md flex flex-col gap-1">
  <span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${label}</span>
  <span class="font-headline-lg text-headline-lg ${accent}">${value}</span>
  <span class="font-body-sm text-body-sm text-on-surface-variant">${sub}</span>
</div>`;

const velocity = [28, 32, 30, 36, 34, 38];
const bars = velocity
  .map(
    (v, i) => `<div class="flex flex-col items-center gap-1 flex-1">
      <div class="w-full rounded-t ${i === velocity.length - 1 ? "bg-primary-container" : "bg-surface-container-highest"}" style="height:${v * 2.4}px"></div>
      <span class="font-label-sm text-label-sm text-outline">S${19 + i}</span></div>`,
  )
  .join("");

const main = `
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
  <div class="flex flex-col gap-space-xs">
    <div class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
      <span>SDLC Workspace</span><span class="text-outline">/</span><span class="text-primary font-medium">Sprint Planning</span>
    </div>
    <h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Plan & Sprint Backlog</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">AI-estimated story points, capacity fit, and dependency-aware sprint allocation.</p>
  </div>
  <div class="flex items-center gap-space-sm">
    <button class="flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface font-body-sm text-body-sm" type="button"><span class="material-symbols-outlined text-[16px] text-outline">download</span>Export CSV / Jira</button>
    <button class="flex items-center gap-space-xs px-space-md py-2 rounded bg-primary-container text-on-primary font-body-sm text-body-sm font-medium hover:bg-primary" type="button"><span class="material-symbols-outlined text-[16px]">auto_awesome</span>Re-estimate Backlog</button>
  </div>
</div>

<div class="grid grid-cols-2 xl:grid-cols-4 gap-gutter">
  ${stat("Sprint 24.4", "36 / 40 pts", "90% capacity · 10 working days", "text-primary")}
  ${stat("Team Velocity", "34.6", "Rolling 6-sprint average")}
  ${stat("Estimation Confidence", "0.87", "Planning-poker agreement vs. AI")}
  ${stat("Risk Flags", "2", "Dependency on BACS clearing API", "text-error")}
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
  ${col("Product Backlog", "inventory_2", "6", "41 pts", [
    { id: "US-PAY-07", title: "Reconcile BACS settlement files nightly", pts: 8, pri: "P1", tag: "Settlement", owner: "AK", trace: "SRS §3.2" },
    { id: "US-PAY-08", title: "Circuit breaker for ledger gateway timeouts", pts: 5, pri: "P1", tag: "Resilience", owner: "RM", trace: "SRS §4.1" },
    { id: "US-PAY-09", title: "Audit trail export for PCI-DSS assessors", pts: 3, pri: "P2", tag: "Compliance", owner: "DM", trace: "SRS §5.3" },
  ], "text-outline")}
  ${col("Sprint 24.4 — Committed", "flag", "5", "36 / 40 pts", [
    { id: "US-PAY-01", title: "Idempotent payment initiation API", pts: 5, pri: "P0", tag: "Ledger", owner: "DM", trace: "SRS §2.1" },
    { id: "US-PAY-02", title: "Async Kafka ledger dispatch with DLQ", pts: 8, pri: "P0", tag: "Ledger", owner: "AK", trace: "SRS §2.2" },
    { id: "US-PAY-03", title: "ISO 20022 pain.001 schema validation", pts: 8, pri: "P1", tag: "Validation", owner: "RM", trace: "SRS §2.3" },
    { id: "US-PAY-04", title: "Tokenize PAN before persistence", pts: 13, pri: "P0", tag: "Security", owner: "SJ", trace: "SRS §5.1" },
  ], "text-primary")}
  ${col("In Review / Done", "task_alt", "3", "16 pts", [
    { id: "US-PAY-05", title: "Redis idempotency TTL lock (120s)", pts: 3, pri: "P0", tag: "Ledger", owner: "DM", trace: "SRS §2.1" },
    { id: "US-PAY-06", title: "OpenAPI 3.1 contract published", pts: 2, pri: "P2", tag: "API", owner: "SJ", trace: "SRS §2.1" },
  ], "text-secondary")}
</div>

<div class="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
  <div class="${card} p-space-md xl:col-span-2">
    <div class="flex items-center justify-between mb-space-md">
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Sprint Burndown</span>
      <span class="font-label-sm text-label-sm text-primary">Day 4 of 10 · on track</span>
    </div>
    <svg viewBox="0 0 600 160" class="w-full h-40">
      <line x1="0" y1="10" x2="600" y2="150" stroke="#414751" stroke-dasharray="4 4"/>
      <polyline fill="none" stroke="#60a5fa" stroke-width="2" points="0,10 60,22 120,30 180,52 240,60"/>
      <polyline fill="none" stroke="#8b919d" stroke-width="1.5" stroke-dasharray="2 4" points="240,60 300,78 360,92 420,108 480,122 540,138 600,150"/>
      <circle cx="240" cy="60" r="4" fill="#a4c9ff"/>
    </svg>
  </div>
  <div class="${card} p-space-md">
    <div class="flex items-center justify-between mb-space-md">
      <span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">Velocity History</span>
      <span class="font-label-sm text-label-sm text-on-surface-variant">pts / sprint</span>
    </div>
    <div class="flex items-end gap-space-sm h-40">${bars}</div>
  </div>
</div>

<div class="${card} p-space-md">
  <div class="flex items-center gap-space-xs mb-space-sm"><span class="material-symbols-outlined text-[16px] text-primary">psychology</span>
  <span class="font-body-sm text-body-sm font-medium text-on-surface">Estimation Rationale — US-PAY-04</span></div>
  <p class="font-body-md text-body-md text-on-surface-variant">Scored 13 points: touches 3 services (gateway, vault, ledger), requires HSM key rotation tests, and carries PCI-DSS Req. 3.4 evidence. Similar historical story US-CARD-112 took 11 pts. Suggest splitting into tokenization service (8) and migration backfill (5).</p>
</div>`;

export const bodyClass = "bg-surface font-body-md text-body-md text-on-surface antialiased";
export const html = shell("04-plan", main);
export const script = "";
