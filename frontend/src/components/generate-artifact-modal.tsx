import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Code2, FileCheck2, Layers3, ListChecks, Network, Sparkles, X } from "lucide-react";

export type ArtifactType = "user_story" | "acceptance_criteria" | "test_case" | "sprint_plan" | "architecture" | "api_spec";
type Inputs = Record<string, string | string[]>;
type Field = { key: string; label: string; required?: boolean; kind?: "textarea" | "select" | "multi" | "range" | "number"; options?: string[]; min?: number; max?: number; placeholder?: string };
type Definition = { type: ArtifactType; name: string; description: string; icon: typeof BookOpen; fields: Field[]; instruction: string };

const definitions: Definition[] = [
  { type: "user_story", name: "User Story", description: "Capture a feature from the user's point of view.", icon: BookOpen, instruction: "Write a concise, actionable user story in As a / I want / So that format, with clear acceptance-ready scope.", fields: [
    { key: "title", label: "Feature / Initiative Title", required: true }, { key: "actor", label: "Actor / Role", required: true }, { key: "goal", label: "Goal", required: true }, { key: "benefit", label: "Business Benefit", required: true }, { key: "priority", label: "Priority", kind: "select", required: true, options: ["P0 - Blocker", "P1 - High", "P2 - Medium", "P3 - Low"] }, { key: "points", label: "Story Points Estimate", kind: "number", min: 1, max: 13 }, { key: "constraints", label: "Constraints / Notes", kind: "textarea" },
  ] },
  { type: "acceptance_criteria", name: "Acceptance Criteria", description: "Define observable behavior and edge cases.", icon: ListChecks, instruction: "Create precise, testable acceptance criteria. Use the requested output format and cover meaningful edge cases.", fields: [
    { key: "story", label: "User Story Title / ID", required: true }, { key: "behavior", label: "Feature Behavior Description", required: true, kind: "textarea" }, { key: "edges", label: "Edge Cases / Error Scenarios", kind: "textarea" }, { key: "format", label: "Output Format", required: true, kind: "select", options: ["Gherkin BDD", "Plain Prose Checklist"] }, { key: "count", label: "Number of Scenarios", kind: "number", min: 1, max: 10 },
  ] },
  { type: "test_case", name: "Test Case", description: "Plan focused coverage across test categories.", icon: FileCheck2, instruction: "Generate specific, reproducible test cases with setup, steps, expected results, and the requested coverage.", fields: [
    { key: "feature", label: "Feature / Function Being Tested", required: true }, { key: "category", label: "Test Category", required: true, kind: "multi", options: ["Unit", "Integration", "End-to-End", "Security", "Performance"] }, { key: "goal", label: "Test Goal", required: true, kind: "textarea" }, { key: "setup", label: "Pre-conditions / Setup", kind: "textarea" }, { key: "count", label: "Number of Test Cases", kind: "range", min: 1, max: 10 }, { key: "trace", label: "Traceability Reference" },
  ] },
  { type: "sprint_plan", name: "Sprint Plan", description: "Shape a realistic sprint around capacity and dependencies.", icon: Layers3, instruction: "Build a practical sprint plan aligned to the goal, team capacity, duration, story list, and dependencies. State assumptions clearly.", fields: [
    { key: "goal", label: "Sprint Goal", required: true, kind: "textarea" }, { key: "velocity", label: "Team Velocity", required: true, kind: "number", min: 1 }, { key: "duration", label: "Sprint Duration", required: true, kind: "select", options: ["1 week", "2 weeks", "3 weeks", "4 weeks"] }, { key: "size", label: "Team Size", kind: "number", min: 1 }, { key: "stories", label: "User Stories to Plan", required: true, kind: "textarea", placeholder: "One story per line" }, { key: "dependencies", label: "Dependency Notes", kind: "textarea" },
  ] },
  { type: "architecture", name: "Architecture Recommendation", description: "Explore an architecture that fits the system constraints.", icon: Network, instruction: "Recommend an architecture with rationale, key components, data and integration flows, tradeoffs, and risks. Address the stated non-functional requirements.", fields: [
    { key: "system", label: "System / Service Name", required: true }, { key: "description", label: "Feature / System Description", required: true, kind: "textarea" }, { key: "stack", label: "Tech Stack Constraints", kind: "textarea" }, { key: "style", label: "Architecture Style", required: true, kind: "select", options: ["Microservices", "Monolith", "Event-Driven", "Serverless", "Hybrid"] }, { key: "nfr", label: "Non-Functional Requirements", kind: "multi", options: ["High Availability", "PCI-DSS", "Low Latency", "Scalability", "GDPR"] }, { key: "patterns", label: "Integration Patterns", kind: "textarea" },
  ] },
  { type: "api_spec", name: "API Specification", description: "Outline endpoints, auth, schemas, and error behavior.", icon: Code2, instruction: "Produce a consistent API specification with endpoint methods and paths, request and response shapes, authentication, and the requested errors. Flag assumptions.", fields: [
    { key: "name", label: "API Name / Purpose", required: true }, { key: "endpoints", label: "Endpoints to Specify", required: true, kind: "textarea", placeholder: "One endpoint per line" }, { key: "auth", label: "Authentication Method", required: true, kind: "select", options: ["Bearer JWT", "API Key", "OAuth 2.0", "None"] }, { key: "version", label: "API Version" }, { key: "notes", label: "Request / Response Notes", kind: "textarea" }, { key: "errors", label: "Error Codes to Include", kind: "textarea" },
  ] },
];

const labelFor = (field: Field, value: string | string[]) => `${field.label}: ${Array.isArray(value) ? value.join(", ") : value}`;
export function buildRequirementText(type: ArtifactType, inputs: Inputs) {
  const definition = definitions.find((item) => item.type === type)!;
  const labels = `[ARTIFACT]: ${definition.name}\n[INSTRUCTIONS]: ${definition.instruction}`;
  const parts = definition.fields.flatMap((field) => {
    const value = inputs[field.key];
    return value !== undefined && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0) ? [labelFor(field, value)] : [];
  });
  return [labels, ...parts].join("\n");
}

export function GenerateArtifactModal({ busy, error, onClose, onGenerate }: { busy: boolean; error: string; onClose: () => void; onGenerate: (type: ArtifactType, text: string) => void }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<ArtifactType | null>(null);
  const [valuesByType, setValuesByType] = useState<Partial<Record<ArtifactType, Inputs>>>({});
  const definition = definitions.find((item) => item.type === selected);
  const values = selected ? valuesByType[selected] ?? {} : {};
  const valid = !!definition && definition.fields.every((field) => {
    const value = values[field.key];
    const hasValue = !!value && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0);
    if (!hasValue) return !field.required;
    if (field.kind === "number" || field.kind === "range") return Number(value) >= (field.min ?? 0) && (!field.max || Number(value) <= field.max);
    return true;
  });
  const prompt = useMemo(() => selected ? buildRequirementText(selected, values) : "", [selected, values]);
  const change = (key: string, value: string | string[]) => {
    if (!selected) return;
    setValuesByType((all) => ({ ...all, [selected]: { ...(all[selected] ?? {}), [key]: value } }));
  };
  return <div className="modal-backdrop generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title">
      <header className="generator-header"><div><span className="section-kicker">AI WORKFLOW · STEP {step} OF 3</span><h2 id="generator-title">Generate an artifact</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={17} /></button></header>
      <div className="generator-progress"><span className={step >= 1 ? "active" : ""} /><span className={step >= 2 ? "active" : ""} /><span className={step >= 3 ? "active" : ""} /></div>
      <div className="generator-form-content">
        <div className="generator-scroll">
          {step === 1 && <><h3>Select an artifact type</h3><p className="generator-help">Choose the engineering deliverable you want SprintSmith to create.</p><div className="artifact-type-grid">{definitions.map(({ type, name, description, icon: Icon }) => <button type="button" key={type} onClick={() => { if (selected !== type) { setSelected(type); setValuesByType((all) => all[type] ? all : { ...all, [type]: type === "test_case" ? { count: "3" } : {} }); } }} className={`artifact-type-card ${selected === type ? "selected" : ""}`} aria-pressed={selected === type}><Icon size={19} /><b>{name}</b><small>{description}</small>{selected === type && <Check size={15} className="card-check" />}</button>)}</div></>}
          {step === 2 && definition && <><button className="generator-back-link" type="button" onClick={() => setStep(1)}><ArrowLeft size={14} /> Change artifact type</button><h3>{definition.name} details</h3><div className="generator-fields">{definition.fields.map((field) => <label key={field.key} className={`generator-field ${field.kind === "textarea" ? "wide" : ""}`}><span>{field.label}{field.required && <i>Required</i>}</span>{field.kind === "textarea" ? <textarea value={String(values[field.key] ?? "")} onChange={(e) => change(field.key, e.target.value)} placeholder={field.placeholder} required={field.required} /> : field.kind === "select" ? <select value={String(values[field.key] ?? "")} onChange={(e) => change(field.key, e.target.value)} required={field.required}><option value="">Select an option</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : field.kind === "multi" ? <div className="generator-chips">{field.options?.map((option) => { const chosen = (values[field.key] as string[] | undefined)?.includes(option) ?? false; return <button type="button" key={option} className={chosen ? "chosen" : ""} onClick={() => change(field.key, chosen ? (values[field.key] as string[]).filter((item) => item !== option) : [...((values[field.key] as string[] | undefined) ?? []), option])}>{option}</button>; })}</div> : field.kind === "range" ? <div className="range-control"><input type="range" min={field.min} max={field.max} value={String(values[field.key] ?? "3")} onChange={(e) => change(field.key, e.target.value)} /><output>{values[field.key] ?? "3"}</output></div> : <input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={String(values[field.key] ?? "")} onChange={(e) => change(field.key, e.target.value)} required={field.required} />}</label>)}</div></>}
          {step === 3 && definition && <><button className="generator-back-link" type="button" onClick={() => setStep(2)}><ArrowLeft size={14} /> Edit details</button><h3>Review your prompt</h3><p className="generator-help">This structured brief will be sent to the existing artifact generator.</p><pre className="prompt-preview">{prompt}</pre></>}
        </div>
        {error && <div className="generator-error" role="alert"><b>{/vector retrieval timed out/i.test(error) ? "Project search is taking longer than expected." : "Artifact generation failed."}</b><span>{/vector retrieval timed out/i.test(error) ? "Your inputs are still here. Try Generate artifact again in a moment." : error}</span></div>}
        <footer className="generator-actions">{step > 1 && <button type="button" className="button button-quiet" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={14} /> Back</button>}<span />{step === 1 ? <button type="button" className="button button-primary" disabled={!selected} onClick={() => setStep(2)}>Continue <ArrowRight size={14} /></button> : step === 2 ? <button type="button" className="button button-primary" disabled={!valid} onClick={() => setStep(3)}>Preview prompt <ArrowRight size={14} /></button> : <button type="button" className="button button-primary" disabled={!valid || busy} onClick={() => { if (selected && valid && !busy) onGenerate(selected, prompt); }}>{busy ? <><span className="button-spinner" /> Generating...</> : <><Sparkles size={15} /> Generate artifact</>}</button>}</footer>
      </div>
    </section>
  </div>;
}
