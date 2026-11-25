import { useState } from "react";
import { CheckCircle2, CircleSlash, Play, RotateCcw, WandSparkles } from "lucide-react";
import { endpoints } from "@/lib/api/endpoints";
import type { RunEvent, RunSummary } from "@/lib/api/types";
import { asNumber, asRecord, asText, formatDateTime } from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice, StatusBadge } from "./common";

type Decision = "approve" | "reject" | "revise" | "resume";

export function RunsPanel({ projectId }: { projectId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answers, setAnswers] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const runs = useApiResource((signal) => endpoints.runs.list(projectId), [projectId]);
  const list = runs.data ?? [];
  const selected = list.find((run) => run.id === selectedId) ?? list[0] ?? null;

  const detail = useApiResource(
    (signal) => (selected?.id ? endpoints.runs.get(selected.id) : Promise.resolve(null)),
    [selected?.id],
  );
  const events = useApiResource(
    (signal) => (selected?.id ? endpoints.runs.events(selected.id) : Promise.resolve([])),
    [selected?.id, detail.data?.status],
  );

  function decisionBody(decision: Decision): Record<string, unknown> {
    if (decision === "approve") return { accepted: true };
    if (decision === "reject") return { accepted: false };
    let parsed: Record<string, string> = {};
    if (answers.trim()) {
      try {
        const candidate: unknown = JSON.parse(answers);
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          parsed = Object.fromEntries(
            Object.entries(asRecord(candidate)).map(([key, value]) => [key, asText(value)]),
          );
        }
      } catch {
        parsed = { response: answers };
      }
    }
    return { answers: parsed };
  }

  async function decide(decision: Decision) {
    if (!selected?.id) return;
    setError("");
    setNotice("");
    try {
      await endpoints.runs.decide(selected.id, decision, decisionBody(decision));
      setNotice(`Run ${decision} accepted by the backend.`);
      detail.reload();
      events.reload();
      runs.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${decision} run.`);
    }
  }

  const finalReport = asRecord(detail.data?.final_report);

  return (
    <div className="feature-grid">
      <FeaturePanel kicker="ORCHESTRATION" title="Workflow runs">
        {runs.loading && <LoadingNotice label="Loading runs" />}
        {runs.error && <ErrorNotice message={runs.error} onRetry={runs.reload} />}
        {!runs.loading && !runs.error && list.length === 0 && (
          <EmptyNotice>No orchestrated runs have been started for this project.</EmptyNotice>
        )}
        {list.length > 0 && (
          <ul className="feature-list">
            {list.map((run) => (
              <li key={run.id ?? asText(run.created_at)}>
                <button
                  type="button"
                  className={`feature-list-item ${selected?.id === run.id ? "active" : ""}`}
                  onClick={() => setSelectedId(run.id ?? null)}
                  aria-pressed={selected?.id === run.id}
                >
                  <span>
                    <b>{asText(run.artifact_type, "workflow")} run</b>
                    <small>{formatDateTime(run.created_at)}</small>
                  </span>
                  <StatusBadge value={asText(run.status, "unknown")} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FeaturePanel>

      <FeaturePanel
        kicker="RUN DETAIL"
        title={selected ? `Run ${asText(selected.id, "").slice(0, 8)}` : "No run selected"}
      >
        {detail.loading && <LoadingNotice label="Loading run" />}
        {detail.error && <ErrorNotice message={detail.error} onRetry={detail.reload} />}
        {detail.data && (
          <div className="feature-stack">
            <div className="artifact-summary-strip">
              <div className="artifact-meta">
                <span>Status</span>
                <b>{asText(detail.data.status, "—")}</b>
              </div>
              <div className="artifact-meta">
                <span>Current node</span>
                <b>{asText(detail.data.current_node, "—")}</b>
              </div>
              <div className="artifact-meta">
                <span>Latency</span>
                <b>{asNumber(detail.data.latency_ms, 0)} ms</b>
              </div>
              <div className="artifact-meta">
                <span>Eval score</span>
                <b>{asText(finalReport["avg_score"], "—")}</b>
              </div>
            </div>
            {asText(detail.data.error_message) && (
              <ErrorNotice message={asText(detail.data.error_message)} />
            )}
            <label className="field-label" htmlFor="run-answers">
              Decision payload (JSON or plain text)
            </label>
            <textarea
              id="run-answers"
              className="text-input feature-textarea"
              rows={3}
              value={answers}
              onChange={(event) => setAnswers(event.target.value)}
            />
            <div className="feature-actions">
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => void decide("approve")}
              >
                <CheckCircle2 size={15} /> Approve
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => void decide("reject")}
              >
                <CircleSlash size={15} /> Reject
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => void decide("revise")}
              >
                <WandSparkles size={15} /> Revise
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => void decide("resume")}
              >
                <Play size={15} /> Resume
              </button>
            </div>
            <p className="feature-footnote">
              Project-level permissions are enforced by the backend; buttons are hidden only when
              the run is unavailable.
            </p>
          </div>
        )}
      </FeaturePanel>

      <FeaturePanel
        kicker="EVENTS"
        title="Run event timeline"
        action={
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              events.reload();
              detail.reload();
            }}
            title="Reload run events"
          >
            <RotateCcw size={15} />
          </button>
        }
      >
        {events.loading && <LoadingNotice label="Loading events" />}
        {events.error && <ErrorNotice message={events.error} onRetry={events.reload} />}
        {!events.loading && !events.error && (events.data?.length ?? 0) === 0 && (
          <EmptyNotice>No events have been recorded for this run.</EmptyNotice>
        )}
        {(events.data?.length ?? 0) > 0 && (
          <ul className="feature-timeline">
            {(events.data as RunEvent[]).map((event, index) => (
              <li key={event.id ?? index}>
                <span className="pulse-dot" aria-hidden="true" />
                <div>
                  <b>{asText(event.node_id, asText(event.agent, "workflow"))}</b>
                  <small>
                    {asText(event.status, "event")} · {formatDateTime(event.created_at)}
                  </small>
                  {asText(event.content) && <p>{asText(event.content)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <p className="feature-success" role="status">
            {notice}
          </p>
        )}
        {error && <ErrorNotice message={error} />}
      </FeaturePanel>
    </div>
  );
}
