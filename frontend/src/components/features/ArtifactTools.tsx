import { useMemo, useState, type FormEvent } from "react";
import { Download, FileJson2, PackageOpen, Star } from "lucide-react";
import { endpoints, type ArtifactExportFormat } from "@/lib/api/endpoints";
import { saveBlob } from "@/lib/api/client";
import type { EvaluationRecord } from "@/lib/api/types";
import {
  asArray,
  asNumber,
  asRecord,
  asText,
  formatCount,
  formatDate,
  formatScore,
  humanize,
  uniqueStrings,
} from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice, StatusBadge } from "./common";

/** Minimal artifact fields used by the tools; compatible with legacy and typed artifacts. */
interface ArtifactSummary {
  id: string;
  artifact_type: string;
  title: string;
  content: Record<string, unknown>;
  version: number;
  created_at: string;
}

const exportFormats: ArtifactExportFormat[] = [
  "json",
  "markdown",
  "md",
  "csv",
  "yaml",
  "yml",
  "gherkin",
];

export function OpenApiPreview({ artifact }: { artifact: ArtifactSummary }) {
  if (artifact.artifact_type !== "api_spec") {
    return <EmptyNotice>OpenAPI preview is available for api_spec artifacts only.</EmptyNotice>;
  }
  const content = asRecord(artifact.content);
  const endpointsList = asArray(content["endpoints"]).map(asRecord);
  const schemas = asArray(content["schemas"] ?? content["models"]).map(asRecord);
  if (!endpointsList.length && !schemas.length) {
    return <EmptyNotice>This artifact did not contain a parseable API specification.</EmptyNotice>;
  }
  return (
    <div className="openapi-preview">
      {endpointsList.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>METHOD</th>
                <th>PATH</th>
                <th>SUMMARY</th>
                <th>RESPONSE</th>
              </tr>
            </thead>
            <tbody>
              {endpointsList.map((endpoint, index) => (
                <tr key={`${asText(endpoint["method"])}-${asText(endpoint["path"])}-${index}`}>
                  <td>
                    <span className="method-badge">
                      {asText(endpoint["method"], "GET").toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <code>{asText(endpoint["path"], "—")}</code>
                  </td>
                  <td>{asText(endpoint["summary"] ?? endpoint["description"], "—")}</td>
                  <td>{formatCount(endpoint["response_code"] ?? endpoint["status_code"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {schemas.length > 0 && (
        <div className="artifact-chips">
          {schemas.map((schema, index) => (
            <span className="artifact-chip" key={`${asText(schema["name"])}-${index}`}>
              {asText(schema["name"], `Schema ${index + 1}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EvaluationPanel({ artifact }: { artifact: ArtifactSummary }) {
  const [score, setScore] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const evaluations = useApiResource(
    (signal) => endpoints.artifacts.evaluations(artifact.id),
    [artifact.id],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await endpoints.artifacts.submitEvaluation(artifact.id, {
        score,
        feedback: feedback.trim() || undefined,
      });
      setFeedback("");
      evaluations.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit evaluation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feature-stack">
      <div className="artifact-summary-strip">
        <div className="artifact-meta">
          <span>Evaluations</span>
          <b>{formatCount(evaluations.data?.length)}</b>
        </div>
        <div className="artifact-meta">
          <span>Latest score</span>
          <b>{formatScore(evaluations.data?.[0]?.score)}</b>
        </div>
      </div>
      {evaluations.loading && <LoadingNotice label="Loading evaluations" />}
      {evaluations.error && (
        <ErrorNotice message={evaluations.error} onRetry={evaluations.reload} />
      )}
      {!evaluations.loading && !evaluations.error && (evaluations.data?.length ?? 0) === 0 && (
        <EmptyNotice>
          Not evaluated yet. No result is shown until the backend returns one.
        </EmptyNotice>
      )}
      {(evaluations.data?.length ?? 0) > 0 && (
        <ul className="feature-list compact">
          {(evaluations.data as EvaluationRecord[]).map((item, index) => (
            <li key={item.id ?? index} className="feature-list-row">
              <span>
                <b>{formatScore(item.score)}</b>
                <small>{asText(item.feedback, "No feedback")}</small>
              </span>
              <small>{formatDate(item.created_at)}</small>
            </li>
          ))}
        </ul>
      )}
      <form className="feature-form" onSubmit={submit}>
        <label className="field-label" htmlFor="evaluation-score">
          Score (1–5)
        </label>
        <select
          id="evaluation-score"
          className="text-input"
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="evaluation-feedback">
          Feedback
        </label>
        <textarea
          id="evaluation-feedback"
          className="text-input feature-textarea"
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
        {error && <ErrorNotice message={error} />}
        <button type="submit" className="button button-primary button-small" disabled={busy}>
          <Star size={15} /> Submit evaluation
        </button>
      </form>
    </div>
  );
}

export function ArtifactTools({
  projectId,
  artifacts,
  onRefresh,
  globalQuery = "",
}: {
  projectId: string;
  artifacts: ArtifactSummary[];
  onRefresh: () => void | Promise<void>;
  globalQuery?: string;
}) {
  const [queryText, setQueryText] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [format, setFormat] = useState<ArtifactExportFormat>("markdown");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const types = uniqueStrings(artifacts.map((artifact) => artifact.artifact_type)).sort();
  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0] ?? null;

  const visible = useMemo(() => {
    const localQuery = queryText.trim().toLowerCase();
    const workspaceQuery = globalQuery.trim().toLowerCase();
    const filtered = artifacts.filter((artifact) => {
      const haystack = `${artifact.title} ${artifact.artifact_type}`.toLowerCase();
      const matchesLocal = !localQuery || haystack.includes(localQuery);
      const matchesWorkspace = !workspaceQuery || haystack.includes(workspaceQuery);
      const matchesType = !typeFilter || artifact.artifact_type === typeFilter;
      return matchesLocal && matchesWorkspace && matchesType;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "title") return asText(a.title).localeCompare(asText(b.title));
      if (sort === "type") return asText(a.artifact_type).localeCompare(asText(b.artifact_type));
      return asText(b.created_at).localeCompare(asText(a.created_at));
    });
  }, [artifacts, queryText, globalQuery, typeFilter, sort]);

  async function downloadArtifact() {
    if (!selected) return;
    setError("");
    setNotice("");
    try {
      const result = await endpoints.artifacts.exportArtifact(
        selected.id,
        format,
        `${selected.artifact_type}.${format}`,
      );
      saveBlob(result.blob, result.filename);
      setNotice(`Downloaded ${result.filename}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    }
  }

  async function downloadZip() {
    setError("");
    setNotice("");
    try {
      const result = await endpoints.artifacts.exportZip(projectId);
      saveBlob(result.blob, result.filename);
      setNotice(`Downloaded ${result.filename}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ZIP export failed.");
    }
  }

  return (
    <div className="feature-grid">
      <FeaturePanel
        kicker="ARTIFACT WORKSPACE"
        title="List and table views"
        action={
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => void onRefresh()}
          >
            <PackageOpen size={15} /> Refresh
          </button>
        }
      >
        <div className="feature-filter-row">
          <label className="feature-filter">
            <span className="sr-only">Search artifacts</span>
            <input
              className="text-input"
              placeholder="Search title or type"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
            />
          </label>
          <label className="feature-filter">
            <span className="sr-only">Filter artifact type</span>
            <select
              className="text-input"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="feature-filter">
            <span className="sr-only">Sort artifacts</span>
            <select
              className="text-input"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="title">Title A–Z</option>
              <option value="type">Type A–Z</option>
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <EmptyNotice>No artifacts match the current filters.</EmptyNotice>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ARTIFACT</th>
                  <th>TYPE</th>
                  <th>VERSION</th>
                  <th>CREATED</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((artifact) => (
                  <tr
                    key={artifact.id}
                    className={selected?.id === artifact.id ? "selected-row" : ""}
                    onClick={() => setSelectedId(artifact.id)}
                  >
                    <td>
                      <b>{artifact.title}</b>
                    </td>
                    <td>
                      <StatusBadge value={humanize(artifact.artifact_type)} />
                    </td>
                    <td>{asNumber(artifact.version, 1)}</td>
                    <td>{formatDate(artifact.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <ErrorNotice message={error} />}
        {notice && (
          <p className="feature-success" role="status">
            {notice}
          </p>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="EXPORT" title="Backend exports">
        {!selected && <EmptyNotice>Select an artifact to export it.</EmptyNotice>}
        {selected && (
          <div className="feature-form">
            <p className="panel-copy">
              Exports are generated by the backend. Gherkin is supported; PDF is not exposed by the
              API.
            </p>
            <label className="field-label" htmlFor="export-format">
              Artifact format
            </label>
            <select
              id="export-format"
              className="text-input"
              value={format}
              onChange={(event) => setFormat(event.target.value as ArtifactExportFormat)}
            >
              {exportFormats.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="feature-actions">
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => void downloadArtifact()}
              >
                <Download size={15} /> Download artifact
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => void downloadZip()}
              >
                <FileJson2 size={15} /> Download project ZIP
              </button>
            </div>
          </div>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="DETAIL" title="Artifact detail">
        {selected ? (
          <OpenApiPreview artifact={selected} />
        ) : (
          <EmptyNotice>Select an artifact to inspect its content.</EmptyNotice>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="EVALUATION" title="Human evaluation">
        {selected ? (
          <EvaluationPanel key={selected.id} artifact={selected} />
        ) : (
          <EmptyNotice>Select an artifact to view or submit evaluations.</EmptyNotice>
        )}
      </FeaturePanel>
    </div>
  );
}
