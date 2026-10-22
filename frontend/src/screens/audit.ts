import { shell } from "./shell";

const card = "rounded-lg bg-surface-container-low border border-outline-variant/30";
const chip = "font-label-sm text-label-sm px-1.5 py-0.5 rounded";

const rows: [string, string, string, string, string, string, string][] = [
  ["09:12:44", "devansh.m", "artifact.signoff", "US-PAY-01", "Signed-off & pushed to Jira", "success", "a91f…2c"],
  ["09:10:02", "langgraph", "generate.complete", "run-09d2e1", "user_story · Llama-3.1-70B · 3.42s", "success", "77be…01"],
  ["09:09:58", "langgraph", "qa_judge.retry", "run-09d2e1", "Score 0.81 < 0.85 → retry #1", "warning", "4c0d…e8"],
  ["09:05:31", "devansh.m", "requirement.upload", "SRS_v2.pdf", "Ingest job job_8812 queued", "success", "b3a2…9f"],
  ["08:59:17", "system", "compliance.gate", "run-09cf77", "PAN detected in output → masked", "error", "e01c…44"],
  ["08:44:03", "a.kapoor", "project.member.add", "Payments Core", "Added s.jain as reviewer", "success", "51aa…7d"],
  ["08:30:20", "r.mathuria", "prompt.publish", "pm_generate", "v3.1 → v3.2 promoted to prod", "success", "9d3e…b0"],
  ["08:12:55", "system", "auth.login.failed", "unknown", "3 failed attempts · IP 10.4.2.19", "warning", "c6f2…13"],
  ["07:58:10", "r.mathuria", "evaluate.batch", "hybrid", "120 cases · MRR 0.91", "success", "0aa7…5e"],
];

const tone: Record<string, string> = {
  success: "bg-secondary-container text-on-secondary-container",
  warning: "bg-surface-container-highest text-tertiary",
  error: "bg-error-container text-on-error-container",
};

const table = rows
  .map(
    ([t, actor, action, target, detail, status, hash]) => `
<tr class="border-b border-outline-variant/20 hover:bg-surface-container">
  <td class="px-space-md py-space-sm font-label-md text-label-md text-outline whitespace-nowrap">${t}</td>
  <td class="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface">${actor}</td>
  <td class="px-space-md py-space-sm font-label-md text-label-md text-primary">${action}</td>
  <td class="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">${target}</td>
  <td class="px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">${detail}</td>
  <td class="px-space-md py-space-sm"><span class="${chip} ${tone[status]}">${status}</span></td>
  <td class="px-space-md py-space-sm font-label-sm text-label-sm text-outline">${hash}</td>
</tr>`,
  )
  .join("");

const filter = (label: string, value: string) =>
  `<div class="flex items-center gap-space-xs px-space-sm py-1.5 rounded bg-surface-container border border-outline-variant/30 font-body-sm text-body-sm"><span class="text-outline">${label}:</span><span class="text-on-surface">${value}</span><span class="material-symbols-outlined text-[14px] text-outline">expand_more</span></div>`;

const main = `
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
  <div class="flex flex-col gap-space-xs">
    <div class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant"><span>Platform</span><span class="text-outline">/</span><span class="text-primary font-medium">Audit Logs</span><span class="${chip} bg-surface-container-highest text-on-surface-variant ml-space-xs">Admin only</span></div>
    <h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Audit Logs</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">Immutable, hash-chained record of every user, agent and system action.</p>
  </div>
  <button class="flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface font-body-sm text-body-sm" type="button"><span class="material-symbols-outlined text-[16px] text-outline">download</span>Export for Assessor</button>
</div>

<div class="grid grid-cols-2 xl:grid-cols-4 gap-gutter">
  ${[["Events (24h)", "1,284", "text-on-surface"], ["Generations", "212", "text-primary"], ["Guardrail Triggers", "7", "text-error"], ["Chain Integrity", "Verified", "text-secondary"]]
    .map(
      ([l, v, c]) => `<div class="${card} p-space-md"><span class="font-label-sm text-label-sm uppercase tracking-wider text-outline">${l}</span><p class="font-headline-lg text-headline-lg ${c} mt-1">${v}</p></div>`,
    )
    .join("")}
</div>

<div class="${card}">
  <div class="flex flex-wrap items-center gap-space-sm p-space-md border-b border-outline-variant/30">
    <div class="flex items-center gap-space-xs px-space-sm py-1.5 rounded bg-surface-container border border-outline-variant/30 w-72"><span class="material-symbols-outlined text-[16px] text-outline">search</span><span class="font-body-sm text-body-sm text-outline">Filter by actor, action, target…</span></div>
    ${filter("Range", "Last 24h")}${filter("Actor", "All")}${filter("Status", "All")}
    <span class="ml-auto font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>Live tail</span>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead><tr class="border-b border-outline-variant/30">
        ${["Time (UTC)", "Actor", "Action", "Target", "Detail", "Status", "Hash"].map((h) => `<th class="px-space-md py-space-sm font-label-sm text-label-sm uppercase tracking-wider text-outline font-medium">${h}</th>`).join("")}
      </tr></thead>
      <tbody>${table}</tbody>
    </table>
  </div>
  <div class="flex items-center justify-between px-space-md py-space-sm font-label-sm text-label-sm text-outline">
    <span>Showing 9 of 1,284 events</span><span>Retention: 7 years · FCA SYSC 9</span>
  </div>
</div>`;

export const bodyClass = "bg-surface font-body-md text-body-md text-on-surface antialiased";
export const html = shell("audit-logs", main);
export const script = "";
