import { unwrapList } from "../normalize";
import {
  apiDownload,
  apiRequest,
  fetchApi,
  type ApiDownload,
  type ApiRequestOptions,
} from "./client";
import type {
  ArtifactOut,
  ArtifactUpdate,
  AuditLog,
  EvaluationCreate,
  EvaluationRecord,
  GenerateRequest,
  HealthStatus,
  IngestJob,
  MonitoringDashboard,
  ProjectOut,
  ProjectStats,
  PromptLibrary,
  PromptRecord,
  RequirementOut,
  RequirementReview,
  RequirementUpdate,
  RequirementVersion,
  RunEvent,
  RunSummary,
  Token,
  TraceabilityGraph,
  UserOut,
  WorkflowRunMetrics,
} from "./types";

export type ArtifactExportFormat = "json" | "markdown" | "md" | "csv" | "yaml" | "yml" | "gherkin";

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function listEnvelope<T>(
  path: string,
  key: string,
  options?: ApiRequestOptions,
): Promise<T[]> {
  return unwrapList(await apiRequest<unknown>(path, options), key) as T[];
}

export const endpoints = {
  auth: {
    login: (email: string, password: string) =>
      apiRequest<Token>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      }),
    me: () => apiRequest<UserOut>("/api/v1/auth/me"),
  },

  projects: {
    list: () => apiRequest<ProjectOut[]>("/api/v1/projects"),
    create: (name: string, description = "") =>
      apiRequest<ProjectOut>("/api/v1/projects", {
        method: "POST",
        body: { name, description },
      }),
    get: (id: string) => apiRequest<ProjectOut>(`/api/v1/projects/${encodeURIComponent(id)}`),
    update: (id: string, update: { name?: string; description?: string }) =>
      apiRequest<ProjectOut>(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: update,
      }),
    remove: (id: string) =>
      apiRequest<void>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
    addMember: (id: string, email: string, role: "editor" | "viewer") =>
      apiRequest<unknown>(
        `/api/v1/projects/${encodeURIComponent(id)}/members${query({ email, role })}`,
        { method: "POST" },
      ),
    history: (id: string) =>
      apiRequest<unknown[]>(`/api/v1/projects/${encodeURIComponent(id)}/history`),
  },

  requirements: {
    list: (
      projectId: string,
      filters: { category?: string; priority?: string; review_status?: string; tag?: string } = {},
    ) =>
      apiRequest<RequirementOut[]>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/requirements${query(filters)}`,
      ),
    get: (id: string) =>
      apiRequest<RequirementOut>(`/api/v1/requirements/${encodeURIComponent(id)}`),
    upload: (projectId: string, file: File, docType = "requirement", signal?: AbortSignal) => {
      const form = new FormData();
      form.append("file", file);
      return apiRequest<IngestJob>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/requirements${query({ doc_type: docType })}`,
        { method: "POST", body: form, ...(signal ? { signal } : {}) },
      );
    },
    ingestText: (projectId: string, content: string, docType = "requirement") =>
      apiRequest<IngestJob>(`/api/v1/projects/${encodeURIComponent(projectId)}/requirements/text`, {
        method: "POST",
        body: { content, doc_type: docType },
      }),
    job: (jobId: string) =>
      apiRequest<IngestJob>(`/api/v1/ingest-jobs/${encodeURIComponent(jobId)}`),
    update: (id: string, update: RequirementUpdate) =>
      apiRequest<RequirementOut>(`/api/v1/requirements/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: update,
      }),
    review: (id: string, review: RequirementReview) =>
      apiRequest<RequirementOut>(`/api/v1/requirements/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: review,
      }),
    versions: (id: string) =>
      listEnvelope<RequirementVersion>(
        `/api/v1/requirements/${encodeURIComponent(id)}/versions`,
        "versions",
      ),
  },

  artifacts: {
    types: () => apiRequest<Record<string, unknown>>("/api/v1/artifact-types"),
    list: (projectId: string) =>
      apiRequest<ArtifactOut[]>(`/api/v1/projects/${encodeURIComponent(projectId)}/artifacts`),
    get: (id: string) => apiRequest<ArtifactOut>(`/api/v1/artifacts/${encodeURIComponent(id)}`),
    update: (id: string, update: ArtifactUpdate) =>
      apiRequest<ArtifactOut>(`/api/v1/artifacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: update,
      }),
    generate: (projectId: string, request: GenerateRequest) =>
      apiRequest<ArtifactOut>(`/api/v1/projects/${encodeURIComponent(projectId)}/generate`, {
        method: "POST",
        body: request,
      }),
    generateStream: (projectId: string, request: GenerateRequest, options?: ApiRequestOptions) =>
      fetchApi(`/api/v1/projects/${encodeURIComponent(projectId)}/generate/stream`, {
        ...options,
        method: "POST",
        body: request,
        responseType: "text",
      }),
    compare: (projectId: string, request: GenerateRequest) =>
      apiRequest<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/compare`, {
        method: "POST",
        body: request,
      }),
    sprintAnalysis: (id: string) =>
      apiRequest<unknown>(`/api/v1/artifacts/${encodeURIComponent(id)}/sprint-analysis`),
    exportArtifact: (
      id: string,
      format: ArtifactExportFormat,
      fallbackFilename?: string,
    ): Promise<ApiDownload> =>
      apiDownload(`/api/v1/artifacts/${encodeURIComponent(id)}/export${query({ format })}`, {
        fallbackFilename: fallbackFilename ?? `artifact.${format}`,
      }),
    exportZip: (projectId: string) =>
      apiDownload(`/api/v1/projects/${encodeURIComponent(projectId)}/artifacts/export.zip`, {
        fallbackFilename: "sprintsmith-artifacts.zip",
      }),
    exportBacklog: (
      id: string,
      target: Record<string, unknown>,
      dryRun = true,
      updateIssueId?: string,
    ) =>
      apiRequest<unknown>(`/api/v1/artifacts/${encodeURIComponent(id)}/export/backlog`, {
        method: "POST",
        body: { target, dry_run: dryRun, update_issue_id: updateIssueId ?? null },
      }),
    evaluations: (id: string) =>
      apiRequest<EvaluationRecord[]>(`/api/v1/artifacts/${encodeURIComponent(id)}/evaluations`),
    submitEvaluation: (id: string, evaluation: EvaluationCreate) =>
      apiRequest<unknown>(`/api/v1/artifacts/${encodeURIComponent(id)}/evaluations`, {
        method: "POST",
        body: evaluation,
      }),
  },

  runs: {
    start: (
      projectId: string,
      request: { requirement_text: string; artifact_type?: string; requirement_id?: string },
    ) =>
      apiRequest<RunSummary>(`/api/v1/projects/${encodeURIComponent(projectId)}/runs`, {
        method: "POST",
        body: { artifact_type: "user_story", ...request },
      }),
    list: (projectId: string) =>
      listEnvelope<RunSummary>(`/api/v1/projects/${encodeURIComponent(projectId)}/runs`, "runs"),
    get: (runId: string) => apiRequest<RunSummary>(`/api/v1/runs/${encodeURIComponent(runId)}`),
    events: (runId: string) =>
      listEnvelope<RunEvent>(`/api/v1/runs/${encodeURIComponent(runId)}/events`, "events"),
    decide: (
      runId: string,
      decision: "approve" | "reject" | "revise" | "resume",
      body: Record<string, unknown> = {},
    ) =>
      apiRequest<RunSummary>(`/api/v1/runs/${encodeURIComponent(runId)}/${decision}`, {
        method: "POST",
        body,
      }),
    metrics: (projectId: string) =>
      apiRequest<WorkflowRunMetrics>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/runs/metrics`,
      ),
  },

  traceability: {
    graph: (projectId: string) =>
      apiRequest<TraceabilityGraph>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/traceability`,
      ),
  },

  prompts: {
    list: () => apiRequest<PromptLibrary>("/api/v1/prompts"),
    get: (artifactType: string, version = "latest") =>
      apiRequest<PromptRecord>(
        `/api/v1/prompts/${encodeURIComponent(artifactType)}${query({ version })}`,
      ),
    save: (artifactType: string, payload: Record<string, unknown>) =>
      apiRequest<PromptRecord>(`/api/v1/prompts/${encodeURIComponent(artifactType)}`, {
        method: "POST",
        body: payload,
      }),
    test: (artifactType: string, payload: Record<string, unknown>) =>
      apiRequest<unknown>(`/api/v1/prompts/${encodeURIComponent(artifactType)}/test`, {
        method: "POST",
        body: payload,
      }),
    orchestrationVersions: (nodeId: string) =>
      listEnvelope<PromptRecord>(
        `/api/v1/prompts/orchestration/${encodeURIComponent(nodeId)}/versions`,
        "versions",
      ),
    saveOrchestrationVersion: (
      nodeId: string,
      payload: {
        version: string;
        template: string;
        experiment_id?: string | null;
        weight?: number;
        enabled?: boolean;
      },
    ) =>
      apiRequest<PromptRecord>(
        `/api/v1/prompts/orchestration/${encodeURIComponent(nodeId)}/versions`,
        { method: "POST", body: { weight: 100, enabled: true, ...payload } },
      ),
  },

  analytics: {
    stats: (projectId: string) =>
      apiRequest<ProjectStats>(`/api/v1/projects/${encodeURIComponent(projectId)}/stats`),
    history: (projectId: string) =>
      apiRequest<unknown[]>(`/api/v1/projects/${encodeURIComponent(projectId)}/history`),
    monitoring: (projectId: string) =>
      apiRequest<MonitoringDashboard>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/monitoring-dashboard`,
      ),
    chat: (projectId: string, message: string) =>
      apiRequest<unknown>(`/api/v1/projects/${encodeURIComponent(projectId)}/chat`, {
        method: "POST",
        body: { message },
      }),
    chatHistory: (projectId: string, limit = 50) =>
      apiRequest<unknown[]>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/chat${query({ limit })}`,
      ),
    caseStudy: (projectId: string, limit = 10) =>
      apiRequest<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/case-study${query({ limit })}`,
        { method: "POST" },
      ),
    auditLogs: (limit = 100) => apiRequest<AuditLog[]>(`/api/v1/audit-logs${query({ limit })}`),
    batchEvaluate: (projectId: string, retrievalMode: "vector" | "hybrid" = "vector") =>
      apiRequest<unknown>(
        `/api/v1/evaluate/batch${query({ project_id: projectId, retrieval_mode: retrievalMode })}`,
        { method: "POST" },
      ),
    health: () => apiRequest<HealthStatus>("/health"),
    databaseHealth: () => apiRequest<HealthStatus>("/health/db"),
    aiHealth: () => apiRequest<HealthStatus>("/health/ai"),
  },
};

/**
 * Reads an SSE stream from a generated/run event endpoint. Each parsed event is
 * delivered to `onEvent`; the caller controls cancellation through `signal`.
 */
export async function streamEvents(
  path: string,
  onEvent: (payload: unknown, eventName: string) => void,
  options: ApiRequestOptions = {},
): Promise<void> {
  const response = await fetchApi(path, {
    ...options,
    headers: { ...options.headers, Accept: "text/event-stream" },
  });
  if (!response.body) throw new Error("The stream did not provide a response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (block: string) => {
    const lines = block.split("\n");
    let eventName = "message";
    const data: string[] = [];
    lines.forEach((line) => {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trim());
    });
    if (!data.length) return;
    const raw = data.join("\n");
    if (raw === "[DONE]") return;
    try {
      onEvent(JSON.parse(raw), eventName);
    } catch {
      onEvent(raw, eventName);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    blocks.forEach((block) => {
      if (block.trim()) emit(block);
    });
  }
  if (buffer.trim()) emit(buffer);
}
