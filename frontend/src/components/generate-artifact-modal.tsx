import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Code2, FileCheck2, Layers3, ListChecks, Network, Sparkles, X } from "lucide-react";

export type ArtifactType = "user_story" | "acceptance_criteria" | "test_case" | "sprint_plan" | "architecture" | "api_spec";
export type ArtifactGeneration = { type: ArtifactType; text: string };
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

const DEMO_DATA: Record<ArtifactType, Inputs> = {
  user_story: {
    title: "Loan Application and Eligibility Pre-Check",
    actor: "Customer",
    goal: "Submit a personal loan application online, calculate indicative EMI, and receive an immediate eligibility assessment.",
    benefit: "Reduce manual loan processing, improve customer experience, and enable faster provisional credit decisions.",
    priority: "P1 - High",
    points: "5",
    constraints: "- Loan amount must be between 1,000 and 50,000.\n- Loan tenure must be between 6 and 60 months.\n- Total monthly obligations including EMI must not exceed 50% of monthly income.\n- Display rejection reason and suggested maximum eligible amount if the eligibility check fails.\n- Automatically save draft applications.\n- Reference: FR-03.",
  },
  acceptance_criteria: {
    story: "FR-03 - Loan Application and Eligibility Pre-Check",
    behavior: "A verified customer can submit a personal loan application by entering the requested loan amount, tenure, employment status, monthly income, and existing monthly obligations. The system calculates indicative EMI, checks eligibility using the 50% income rule, displays the eligibility result, and automatically saves draft applications.",
    edges: "- Loan amount below 1,000 or above 50,000.\n- Loan tenure outside 6 to 60 months.\n- Total obligations exceeding 50% of monthly income.\n- Total obligations exactly equal to 50% of monthly income.\n- Missing or invalid financial information.\n- Customer resumes an autosaved draft.",
    format: "Gherkin BDD",
    count: "6",
  },
  test_case: {
    feature: "Loan Application and Eligibility Pre-Check",
    category: ["Integration", "End-to-End"],
    goal: "Verify loan application submission, indicative EMI calculation, loan amount and tenure validation, eligibility evaluation using the 50% income rule, error handling, and draft autosave functionality.",
    setup: "- Registered and authenticated customer.\n- Completed KYC verification.\n- Loan application service and database available.\n- Interest-rate configuration available.\n- Synthetic customer and financial test data prepared.",
    count: "6",
    trace: "FR-03",
  },
  sprint_plan: {
    goal: "Develop the personal loan application and eligibility pre-check module, enabling verified customers to apply for loans, calculate indicative EMI, check eligibility, and save draft applications.",
    velocity: "20",
    duration: "2 weeks",
    size: "5",
    stories: "- As a customer, I want to enter loan amount and tenure so that I can apply for a personal loan.\n- As a customer, I want to provide income and existing obligations so that my eligibility can be assessed.\n- As a customer, I want to view indicative EMI so that I understand my monthly repayment.\n- As a customer, I want to receive an eligibility result so that I know whether I qualify.\n- As a customer, I want to see rejection reasons and a suggested maximum amount if ineligible.\n- As a customer, I want my application draft saved automatically so that I can resume later.",
    dependencies: "- Customer authentication and KYC verification.\n- PostgreSQL database integration.\n- Interest-rate configuration.\n- Backend API availability.",
  },
  architecture: {
    system: "Digital Personal Loan Origination Portal",
    description: "A secure web-based platform enabling customers to register, complete KYC verification, apply for personal loans, upload supporting documents, receive automated credit decisions, track application status, and accept loan offers. Loan officers and underwriters can review applications through a role-based console. The system maintains audit logs and provides an operations dashboard.",
    stack: "- Frontend: React\n- Backend: Python FastAPI\n- Database: PostgreSQL\n- Authentication: JWT\n- Identity Verification: Mock identity-check REST API\n- Credit Scoring: Simulated credit-bureau REST API\n- Security: TLS 1.2+, encryption at rest, bcrypt or Argon2 password hashing",
    style: "Microservices",
    nfr: ["High Availability", "Low Latency", "Scalability", "GDPR"],
    patterns: "- REST APIs for frontend-backend communication.\n- REST integration with identity verification and credit-bureau services.\n- Asynchronous email and SMS notifications.\n- Retry with exponential backoff for credit-bureau failures.\n- Role-based access control.\n- Immutable audit logging.\n- Horizontal scaling to support 5,000 concurrent users.",
  },
  api_spec: {
    name: "Personal Loan Application and Eligibility API",
    endpoints: "POST /api/v1/loans/applications\nGET /api/v1/loans/applications/{id}\nPATCH /api/v1/loans/applications/{id}\nPOST /api/v1/loans/applications/{id}/eligibility-check\nGET /api/v1/loans/applications/{id}/status",
    auth: "Bearer JWT",
    version: "v1",
    notes: "- Request fields include loan amount, tenure, employment status, monthly income, and existing obligations.\n- Loan amount must be between 1,000 and 50,000.\n- Tenure must be between 6 and 60 months.\n- Response includes application ID, indicative EMI, eligibility result, and application status.\n- Eligibility is determined using the 50% income rule.\n- Failed eligibility checks return a reason and suggested maximum eligible amount.\n- Support draft autosave and retrieval.\n- JWT authentication is required.",
    errors: "- 400 - Invalid request\n- 401 - Unauthorized\n- 403 - Forbidden\n- 404 - Application not found\n- 422 - Validation failure\n- 429 - Too many requests\n- 500 - Internal server error\n- 503 - Service unavailable",
  },
};

const labelFor = (field: Field, value: string | string[]) => `${field.label}: ${Array.isArray(value) ? value.join(", ") : value}`;
const demoDataFor = (type: ArtifactType): Inputs => Object.fromEntries(
  Object.entries(DEMO_DATA[type]).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
);
export function buildRequirementText(type: ArtifactType, inputs: Inputs) {
  const definition = definitions.find((item) => item.type === type)!;
  const labels = `[ARTIFACT]: ${definition.name}\n[INSTRUCTIONS]: ${definition.instruction}`;
  const parts = definition.fields.flatMap((field) => {
    const value = inputs[field.key];
    return value !== undefined && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0) ? [labelFor(field, value)] : [];
  });
  return [labels, ...parts].join("\n");
}

export function GenerateArtifactModal({ busy, error, onClose, onGenerate }: { busy: boolean; error: string; onClose: () => void; onGenerate: (artifacts: ArtifactGeneration[]) => void }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<ArtifactType[]>([]);
  const [valuesByType, setValuesByType] = useState<Partial<Record<ArtifactType, Inputs>>>({});
  const selectedDefinitions = definitions.filter(({ type }) => selected.includes(type));
  const isValid = (definition: Definition) => definition.fields.every((field) => {
    const value = valuesByType[definition.type]?.[field.key];
    const hasValue = !!value && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0);
    if (!hasValue) return !field.required;
    if (field.kind === "number" || field.kind === "range") return Number(value) >= (field.min ?? 0) && (!field.max || Number(value) <= field.max);
    return true;
  });
  const valid = selectedDefinitions.length > 0 && selectedDefinitions.every(isValid);
  const prompts = useMemo(() => selected.map((type) => ({ type, text: buildRequirementText(type, valuesByType[type] ?? {}) })), [selected, valuesByType]);
  const normalizedError = error.toLowerCase();
  const vectorTimeout = /vector retrieval timed out/i.test(error);
  const aiUnavailable =
    normalizedError.includes("ai engine is unavailable") ||
    normalizedError.includes("ai engine is temporarily unavailable");
  const invalidAiResponse =
    normalizedError.includes("ai engine returned an invalid response") ||
    normalizedError.includes("invalid artifact response") ||
    normalizedError.includes("invalid artifact payload");
  const change = (type: ArtifactType, key: string, value: string | string[]) => {
    setValuesByType((all) => ({ ...all, [type]: { ...(all[type] ?? {}), [key]: value } }));
  };
  return <div className="modal-backdrop generator-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title">
      <header className="generator-header"><div><span className="section-kicker">AI WORKFLOW · STEP {step} OF 3</span><h2 id="generator-title">Generate an artifact</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={17} /></button></header>
      <div className="generator-progress"><span className={step >= 1 ? "active" : ""} /><span className={step >= 2 ? "active" : ""} /><span className={step >= 3 ? "active" : ""} /></div>
      <div className="generator-form-content">
        <div className="generator-scroll">
          {step === 1 && <><h3>Select artifact types</h3><p className="generator-help">Choose one or more engineering deliverables for SprintSmith to create.</p><div className="artifact-type-grid">{definitions.map(({ type, name, description, icon: Icon }) => { const chosen = selected.includes(type); return <button type="button" key={type} onClick={() => setSelected((current) => chosen ? current.filter((item) => item !== type) : [...current, type])} className={`artifact-type-card ${chosen ? "selected" : ""}`} aria-pressed={chosen}><Icon size={19} /><b>{name}</b><small>{description}</small>{chosen && <Check size={15} className="card-check" />}</button>; })}</div></>}
          {step === 2 && <><button className="generator-back-link" type="button" onClick={() => setStep(1)}><ArrowLeft size={14} /> Change artifact types</button>{selectedDefinitions.map((definition) => { const values = valuesByType[definition.type] ?? {}; return <section className="generator-artifact-section" key={definition.type}><div className="generator-artifact-heading"><h3>{definition.name} details</h3><button type="button" className="button button-quiet demo-data-button" onClick={() => setValuesByType((all) => ({ ...all, [definition.type]: demoDataFor(definition.type) }))}>Use Demo Data</button></div><div className="generator-fields">{definition.fields.map((field) => <label key={field.key} className={`generator-field ${field.kind === "textarea" ? "wide" : ""}`}><span>{field.label}{field.required && <i>Required</i>}</span>{field.kind === "textarea" ? <textarea value={String(values[field.key] ?? "")} onChange={(e) => change(definition.type, field.key, e.target.value)} placeholder={field.placeholder} required={field.required} /> : field.kind === "select" ? <select value={String(values[field.key] ?? "")} onChange={(e) => change(definition.type, field.key, e.target.value)} required={field.required}><option value="">Select an option</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : field.kind === "multi" ? <div className="generator-chips">{field.options?.map((option) => { const chosen = (values[field.key] as string[] | undefined)?.includes(option) ?? false; return <button type="button" key={option} className={chosen ? "chosen" : ""} onClick={() => change(definition.type, field.key, chosen ? (values[field.key] as string[]).filter((item) => item !== option) : [...((values[field.key] as string[] | undefined) ?? []), option])}>{option}</button>; })}</div> : field.kind === "range" ? <div className="range-control"><input type="range" min={field.min} max={field.max} value={String(values[field.key] ?? field.min ?? 1)} onChange={(e) => change(definition.type, field.key, e.target.value)} /><output>{values[field.key] ?? field.min ?? 1}</output></div> : <input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={String(values[field.key] ?? "")} onChange={(e) => change(definition.type, field.key, e.target.value)} required={field.required} />}</label>)}</div></section>; })}</>}
          {step === 3 && <><button className="generator-back-link" type="button" onClick={() => setStep(2)}><ArrowLeft size={14} /> Edit details</button><h3>Review your prompts</h3><p className="generator-help">Each brief will be sent to the artifact generator separately.</p>{prompts.map(({ type, text }) => <section className="generator-artifact-section" key={type}><h4>{definitions.find((item) => item.type === type)?.name}</h4><pre className="prompt-preview">{text}</pre></section>)}</>}
        </div>
        {error && (
          <div className="generator-error" role="alert">
            <b>
              {vectorTimeout
                ? "Project search is taking longer than expected."
                : aiUnavailable
                  ? "The AI engine is temporarily unavailable."
                  : invalidAiResponse
                    ? "The AI engine returned an invalid response."
                    : "Artifact generation failed."}
            </b>
            <span>
              {vectorTimeout
                ? "Your inputs are still here. Try Generate artifact again in a moment."
                : aiUnavailable || invalidAiResponse
                  ? `Your prompt is still here. ${error} You can retry when ready.`
                : error}
            </span>
          </div>
        )}
        <footer className="generator-actions">{step > 1 && <button type="button" className="button button-quiet" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={14} /> Back</button>}<span />{step === 1 ? <button type="button" className="button button-primary" disabled={!selected.length} onClick={() => setStep(2)}>Continue <ArrowRight size={14} /></button> : step === 2 ? <button type="button" className="button button-primary" disabled={!valid} onClick={() => setStep(3)}>Preview prompts <ArrowRight size={14} /></button> : <button type="button" className="button button-primary" disabled={!valid || busy} onClick={() => { if (valid && !busy) onGenerate(prompts); }}>{busy ? <><span className="button-spinner" /> Generating...</> : <><Sparkles size={15} /> Generate {prompts.length === 1 ? "artifact" : `${prompts.length} artifacts`}</>}</button>}</footer>
      </div>
    </section>
  </div>;
}
