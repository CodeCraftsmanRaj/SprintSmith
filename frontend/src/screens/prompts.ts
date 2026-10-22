import { shell } from "./shell";

const card = "rounded-lg bg-surface-container-low border border-outline-variant/30";
const chip = "font-label-sm text-label-sm px-1.5 py-0.5 rounded";

const prompts = [
  { id: "pm_generate", name: "User Story Synthesis", type: "user_story", ver: "v3.2", score: "0.94", model: "Llama-3.1-70B", active: true },
  { id: "qa_gherkin", name: "Gherkin Acceptance Criteria", type: "acceptance_criteria", ver: "v2.8", score: "0.91", model: "Llama-3.1-70B" },
  { id: "qa_testcases", name: "Test Case & Data Generator", type: "test_cases", ver: "v2.1", score: "0.88", model: "Llama-3.1-70B" },
  { id: "api_openapi", name: "OpenAPI 3.1 Contract", type: "api_spec", ver: "v1.9", score: "0.90", model: "Mixtral-8x7B" },
  { id: "arch_adr", name: "Architecture Decision Record", type: "architecture", ver: "v1.4", score: "0.86", model: "Llama-3.1-70B" },
  { id: "plan_estimate", name: "Sprint Story Point Estimation", type: "estimation", ver: "v1.2", score: "0.83", model: "Llama-3.1-8B" },
  { id: "qa_judge", name: "QA Judge — Heuristic Evaluator", type: "evaluation", ver: "v2.0", score: "0.89", model: "Llama-3.1-70B" },
];

const list = prompts
  .map(
    (p) => `
<div class="flex items-center justify-between px-space-md py-space-sm rounded ${p.active ? "bg-surface-container-high" : "hover:bg-surface-container"} cursor-pointer">
  <div class="flex flex-col">
    <span class="font-body-sm text-body-sm text-on-surface ${p.active ? "font-medium" : ""}">${p.name}</span>
    <span class="font-label-sm text-label-sm text-outline">${p.id} · ${p.type}</span>
  </div>
  <div class="flex items-center gap-space-xs">
    <span class="${chip} bg-surface-container-highest text-on-surface-variant">${p.ver}</span>
    <span class="${chip} bg-secondary-container text-on-secondary-container">${p.score}</span>
  </div>
</div>`,
  )
  .join("");

const tmpl = `<span class="text-primary">## SYSTEM</span>
You are a Principal Product Owner at a UK retail bank.
Write user stories that satisfy INVEST and cite SRS sections.

<span class="text-primary">## CONTEXT</span> <span class="text-outline">(retrieved · MMR k=6)</span>
<span class="text-secondary">{{retrieved_chunks}}</span>

<span class="text-primary">## TASK</span>
Given requirement <span class="text-secondary">{{requirement_id}}</span>, produce JSON:
{ "id", "as_a", "i_want", "so_that", "priority", "story_points", "trace": [] }

<span class="text-primary">## GUARDRAILS</span>
- Never invent regulatory clauses not present in context.
- Mask any PAN / sort code using ****.
- Return only valid JSON matching schema <span class="text-secondary">user_story.v3</span>.`;

const versions = [
  ["v3.2", "Added PII masking guardrail", "0.94", "2d ago"],
  ["v3.1", "Switched retrieval to hybrid MMR", "0.92", "6d ago"],
  ["v3.0", "JSON schema output contract", "0.89", "2w ago"],
  ["v2.4", "Few-shot BFSI examples", "0.84", "1mo ago"],
]
  .map(
    ([v, d, s, t]) => `<div class="flex items-center justify-between py-1.5 border-b border-outline-variant/20 last:border-0">
  <div class="flex items-center gap-space-sm"><span class="font-label-sm text-label-sm text-primary">${v}</span><span class="font-body-sm text-body-sm text-on-surface-variant">${d}</span></div>
  <div class="flex items-center gap-space-sm"><span class="font-label-sm text-label-sm text-on-surface">${s}</span><span class="font-label-sm text-label-sm text-outline">${t}</span></div></div>`,
  )
  .join("");

const main = `
<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
  <div class="flex flex-col gap-space-xs">
    <div class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant"><span>Platform</span><span class="text-outline">/</span><span class="text-primary font-medium">Prompt Library</span></div>
    <h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Prompt Library</h1>
    <p class="font-body-md text-body-md text-on-surface-variant">Versioned, evaluated prompt templates powering each SDLC artifact type.</p>
  </div>
  <div class="flex items-center gap-space-sm">
    <div class="flex items-center gap-space-xs px-space-sm py-2 rounded bg-surface-container border border-outline-variant/30 w-64"><span class="material-symbols-outlined text-[16px] text-outline">search</span><span class="font-body-sm text-body-sm text-outline">Search prompts…</span></div>
    <button class="flex items-center gap-space-xs px-space-md py-2 rounded bg-primary-container text-on-primary font-body-sm text-body-sm font-medium hover:bg-primary" type="button"><span class="material-symbols-outlined text-[16px]">add</span>New Prompt</button>
  </div>
</div>

<div class="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-gutter">
  <div class="${card} p-space-sm flex flex-col gap-0.5">
    <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline px-space-md py-space-xs">7 templates</p>
    ${list}
  </div>
  <div class="flex flex-col gap-gutter">
    <div class="${card} p-space-md">
      <div class="flex items-center justify-between mb-space-md">
        <div class="flex flex-col">
          <div class="flex items-center gap-space-xs"><span class="font-headline-md text-headline-md text-on-surface">User Story Synthesis</span><span class="${chip} bg-surface-container-highest text-primary">v3.2 · Production</span></div>
          <span class="font-label-sm text-label-sm text-outline">node:pm_generate · Llama-3.1-70B · temp 0.0 · max 1,024 tokens</span>
        </div>
        <div class="flex items-center gap-space-xs">
          <button class="flex items-center gap-1 px-space-sm py-1.5 rounded bg-surface-container-high text-on-surface font-body-sm text-body-sm" type="button"><span class="material-symbols-outlined text-[16px]">play_arrow</span>Test Run</button>
          <button class="flex items-center gap-1 px-space-sm py-1.5 rounded bg-surface-container-high text-on-surface font-body-sm text-body-sm" type="button"><span class="material-symbols-outlined text-[16px]">compare_arrows</span>Compare</button>
        </div>
      </div>
      <pre class="rounded bg-surface-container-lowest p-space-md font-label-md text-label-md text-on-surface-variant whitespace-pre-wrap leading-relaxed">${tmpl}</pre>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
      <div class="${card} p-space-md">
        <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline mb-space-sm">Evaluation (golden set · 120 cases)</p>
        ${[["Faithfulness", 96], ["INVEST compliance", 94], ["Schema validity", 100], ["Traceability recall", 88]]
          .map(
            ([k, v]) => `<div class="mb-space-sm"><div class="flex justify-between font-label-sm text-label-sm mb-1"><span class="text-on-surface-variant">${k}</span><span class="text-on-surface">${v}%</span></div><div class="h-1.5 rounded-full bg-surface-container-highest"><div class="h-1.5 rounded-full bg-primary-container" style="width:${v}%"></div></div></div>`,
          )
          .join("")}
      </div>
      <div class="${card} p-space-md">
        <p class="font-label-sm text-label-sm uppercase tracking-wider text-outline mb-space-sm">Version History</p>
        ${versions}
      </div>
    </div>
  </div>
</div>`;

export const bodyClass = "bg-surface font-body-md text-body-md text-on-surface antialiased";
export const html = shell("prompt-library", main);
export const script = "";
