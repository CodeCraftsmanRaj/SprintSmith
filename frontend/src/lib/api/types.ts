/**
 * Types derived from the integrated backend's live OpenAPI schema
 * (`app.openapi()`, 48 paths) and its Pydantic/route implementations.
 * Fields returned by untyped routes are optional; runtime normalization is
 * still required at the UI boundary.
 */

export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
  is_active?: boolean;
}

export interface ProjectOut {
  id: string;
  name: string;
  description: string;
  owner_id?: string;
  created_at: string;
  archived?: boolean;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
}

export interface ArtifactOut {
  id: string;
  project_id: string;
  created_by: string;
  artifact_type: string;
  title: string;
  content: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ArtifactUpdate {
  title?: string | null;
  content?: Record<string, unknown> | null;
}

export interface GenerateRequest {
  artifact_type: string;
  requirement_text: string;
  requirement_id?: string | null;
}

export interface RequirementOut {
  id: string;
  project_id?: string;
  filename?: string;
  doc_type?: string;
  content?: string;
  title?: string;
  category?: string | null;
  tags?: string[];
  priority?: string | null;
  review_status?: string | null;
  version?: number;
  index_stale?: boolean;
  indexing_status?: string | null;
  chunks_indexed?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RequirementUpdate {
  content?: string | null;
  filename?: string | null;
  category?: string | null;
  tags?: string[] | null;
  priority?: string | null;
  expected_version?: number | null;
  change_summary?: string | undefined;
}

export interface RequirementReview {
  decision: string;
  review_note?: string;
  expected_version?: number | null;
}

export interface RequirementVersion {
  id?: string;
  requirement_id?: string;
  version?: number;
  changed_by?: string;
  snapshot?: Record<string, unknown>;
  change_summary?: string;
  created_at?: string;
}

export interface IngestJob {
  id?: string;
  job_id?: string;
  requirement_id?: string;
  status: string;
  chunks_indexed?: number;
  error_message?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EvaluationCreate {
  /** Backend contract: integer 1–5. */
  score: number;
  feedback?: string | undefined;
  metrics?: Record<string, unknown> | undefined;
}

export interface EvaluationRecord {
  id?: string;
  artifact_id?: string;
  user_id?: string;
  score?: number | null;
  feedback?: string | null;
  metrics?: Record<string, unknown>;
  created_at?: string;
}

export interface PromptVariantMetric {
  node_id: string;
  version?: string | null;
  experiment_id?: string | null;
  run_count?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  average_latency_ms?: number;
  estimated_cost_usd?: number | null;
  average_review_score?: number | null;
}

export interface WorkflowRunMetrics {
  run_count?: number;
  status_counts?: Record<string, number>;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  total_latency_ms?: number;
  average_latency_ms?: number;
  estimated_cost_usd?: number | null;
  prompt_variant_metrics?: PromptVariantMetric[];
}

export interface RunSummary {
  id?: string;
  project_id?: string;
  requirement_id?: string | null;
  artifact_type?: string;
  status?: string;
  current_node?: string | null;
  paused_node_id?: string | null;
  final_report?: Record<string, unknown> | null;
  final_artifact?: Record<string, unknown> | null;
  error_message?: string | null;
  usage?: Record<string, unknown>;
  latency_ms?: number;
  prompt_assignments?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface RunEvent {
  id?: string;
  run_id?: string;
  node_id?: string;
  agent?: string;
  status?: string;
  content?: string;
  data?: Record<string, unknown>;
  created_at?: string;
}

export interface TraceabilityNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface TraceabilityEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

export interface TraceabilityGraph {
  nodes?: TraceabilityNode[];
  edges?: TraceabilityEdge[];
}

export interface PromptRecord {
  id?: string;
  node_id?: string;
  artifact_type?: string;
  version?: string;
  version_id?: string;
  version_file?: string;
  prompt_hash?: string;
  template?: string;
  spec?: Record<string, unknown>;
  description?: string;
  category?: string;
  experiment_id?: string | null;
  weight?: number;
  enabled?: boolean;
  created_at?: string;
}

export interface ProjectStats {
  artifacts_by_type?: Record<string, number>;
  total_artifacts?: number;
  total_generations?: number;
  avg_eval_score?: number | null;
  total_tokens_used?: number;
  generation_trend_7d?: unknown[];
  [key: string]: unknown;
}

export interface MonitoringDashboard {
  available: boolean;
  dashboard_url?: string | null;
  message?: string | null;
}

export interface HealthStatus {
  status?: string;
  ok?: boolean;
  [key: string]: unknown;
}

export interface AuditLog {
  id?: string;
  action?: string;
  actor_id?: string;
  project_id?: string | null;
  details?: Record<string, unknown>;
  created_at?: string;
}

/** Engine prompt library payload: `{artifact_types: {type: versions[]}}`. */
export interface PromptLibrary {
  artifact_types?: Record<string, Array<Record<string, unknown>>>;
  [key: string]: unknown;
}
