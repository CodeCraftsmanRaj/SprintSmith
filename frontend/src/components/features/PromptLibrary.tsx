import { useState, type FormEvent } from "react";
import { BookOpen, FlaskConical, Save } from "lucide-react";
import { endpoints } from "@/lib/api/endpoints";
import type { PromptRecord } from "@/lib/api/types";
import {
  asArray,
  asNumber,
  asRecord,
  asText,
  formatDateTime,
  humanize,
  uniqueStrings,
} from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice } from "./common";

const orchestrationNodes = [
  "analyst",
  "story_writer",
  "ac_generator",
  "test_case_writer",
  "api_spec",
  "architecture",
  "sprint_plan",
] as const;

export function PromptLibrary({ role }: { role: string }) {
  const canWrite = role.toLowerCase() === "admin";
  const [artifactType, setArtifactType] = useState("");
  const [nodeId, setNodeId] = useState<string>(orchestrationNodes[0]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [humanPrompt, setHumanPrompt] = useState("");
  const [versionId, setVersionId] = useState("");
  const [requirementText, setRequirementText] = useState("");
  const [orchestrationVersion, setOrchestrationVersion] = useState("");
  const [orchestrationTemplate, setOrchestrationTemplate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const library = useApiResource((signal) => endpoints.prompts.list(), []);
  const libraryTypes = uniqueStrings(Object.keys(asRecord(library.data?.artifact_types)));
  const activeType = artifactType || libraryTypes[0] || "";

  const detail = useApiResource(
    (signal) => (activeType ? endpoints.prompts.get(activeType) : Promise.resolve(null)),
    [activeType],
  );
  const versions = useApiResource(
    (signal) => endpoints.prompts.orchestrationVersions(nodeId),
    [nodeId],
  );

  async function saveEnginePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await endpoints.prompts.save(activeType, {
        system: systemPrompt,
        human: humanPrompt,
        version_id: versionId || null,
      });
      setMessage("Prompt version saved by the backend.");
      detail.reload();
      library.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save prompt.");
    }
  }

  async function testPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const result = await endpoints.prompts.test(activeType, {
        version: "latest",
        requirement_text: requirementText,
      });
      const record = asRecord(result);
      setMessage(`Test completed. Version: ${asText(record["version_id"], "latest")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not test prompt.");
    }
  }

  async function saveOrchestrationPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await endpoints.prompts.saveOrchestrationVersion(nodeId, {
        version: orchestrationVersion,
        template: orchestrationTemplate,
      });
      setMessage("Orchestration prompt version created.");
      setOrchestrationVersion("");
      setOrchestrationTemplate("");
      versions.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save orchestration prompt.");
    }
  }

  const spec = asRecord(detail.data?.spec);

  return (
    <div className="feature-grid">
      <FeaturePanel kicker="PROMPT REGISTRY" title="Artifact prompt library">
        {library.loading && <LoadingNotice label="Loading prompts" />}
        {library.error && <ErrorNotice message={library.error} onRetry={library.reload} />}
        {!library.loading && libraryTypes.length === 0 && (
          <EmptyNotice>The prompt engine did not return any artifact types.</EmptyNotice>
        )}
        {libraryTypes.length > 0 && (
          <ul className="feature-list">
            {libraryTypes.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  className={`feature-list-item ${activeType === type ? "active" : ""}`}
                  onClick={() => setArtifactType(type)}
                  aria-pressed={activeType === type}
                >
                  <span>
                    <b>{humanize(type)}</b>
                    <small>
                      {asArray(asRecord(library.data?.artifact_types)[type]).length} versions
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </FeaturePanel>

      <FeaturePanel
        kicker="VERSION DETAIL"
        title={activeType ? humanize(activeType) : "No prompt selected"}
      >
        {detail.loading && <LoadingNotice label="Loading prompt" />}
        {detail.error && <ErrorNotice message={detail.error} onRetry={detail.reload} />}
        {detail.data && (
          <div className="feature-stack">
            <div className="artifact-summary-strip">
              <div className="artifact-meta">
                <span>Version</span>
                <b>{asText(detail.data.version_id, asText(detail.data.version, "latest"))}</b>
              </div>
              <div className="artifact-meta">
                <span>File</span>
                <b>{asText(detail.data.version_file, "—")}</b>
              </div>
            </div>
            {Object.keys(spec).length > 0 && (
              <pre className="feature-code">{JSON.stringify(spec, null, 2)}</pre>
            )}
            {Object.keys(spec).length === 0 && (
              <EmptyNotice>No prompt specification was returned.</EmptyNotice>
            )}
          </div>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="GOVERNANCE" title="Orchestration prompt versions">
        <label className="field-label" htmlFor="orchestration-node">
          Node
        </label>
        <select
          id="orchestration-node"
          className="text-input"
          value={nodeId}
          onChange={(event) => setNodeId(event.target.value)}
        >
          {orchestrationNodes.map((node) => (
            <option key={node} value={node}>
              {humanize(node)}
            </option>
          ))}
        </select>
        {versions.loading && <LoadingNotice label="Loading versions" />}
        {versions.error && <ErrorNotice message={versions.error} onRetry={versions.reload} />}
        {(versions.data?.length ?? 0) === 0 && !versions.loading && (
          <EmptyNotice>No governed versions exist for this node.</EmptyNotice>
        )}
        {(versions.data?.length ?? 0) > 0 && (
          <ul className="feature-list compact">
            {(versions.data as PromptRecord[]).map((version, index) => (
              <li key={version.id ?? index} className="feature-list-row">
                <span>
                  <b>{asText(version.version, "—")}</b>
                  <small>{asText(version.experiment_id, "No experiment")}</small>
                </span>
                <span>weight {asNumber(version.weight, 100)}</span>
                <small>{formatDateTime(version.created_at)}</small>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <form className="feature-form" onSubmit={saveOrchestrationPrompt}>
            <label className="field-label" htmlFor="orchestration-version">
              New version
            </label>
            <input
              id="orchestration-version"
              className="text-input"
              required
              value={orchestrationVersion}
              onChange={(event) => setOrchestrationVersion(event.target.value)}
            />
            <label className="field-label" htmlFor="orchestration-template">
              Template
            </label>
            <textarea
              id="orchestration-template"
              className="text-input feature-textarea"
              rows={4}
              required
              value={orchestrationTemplate}
              onChange={(event) => setOrchestrationTemplate(event.target.value)}
            />
            <button type="submit" className="button button-primary button-small">
              <Save size={15} /> Save version
            </button>
          </form>
        )}
        {!canWrite && (
          <EmptyNotice>
            Prompt writes require the admin role. Read-only access is active.
          </EmptyNotice>
        )}
      </FeaturePanel>

      {canWrite && (
        <FeaturePanel
          kicker="AUTHORING"
          title={`Write and test ${activeType ? humanize(activeType) : "prompt"}`}
        >
          <form className="feature-form" onSubmit={saveEnginePrompt}>
            <label className="field-label" htmlFor="prompt-system">
              System prompt
            </label>
            <textarea
              id="prompt-system"
              className="text-input feature-textarea"
              rows={4}
              required
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <label className="field-label" htmlFor="prompt-human">
              Human prompt
            </label>
            <textarea
              id="prompt-human"
              className="text-input feature-textarea"
              rows={4}
              required
              value={humanPrompt}
              onChange={(event) => setHumanPrompt(event.target.value)}
            />
            <label className="field-label" htmlFor="prompt-version-id">
              Version id (optional)
            </label>
            <input
              id="prompt-version-id"
              className="text-input"
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            />
            <button
              type="submit"
              className="button button-primary button-small"
              disabled={!activeType}
            >
              <Save size={15} /> Save prompt
            </button>
          </form>
          <form className="feature-form" onSubmit={testPrompt}>
            <label className="field-label" htmlFor="prompt-test-text">
              Test requirement text
            </label>
            <textarea
              id="prompt-test-text"
              className="text-input feature-textarea"
              rows={3}
              required
              value={requirementText}
              onChange={(event) => setRequirementText(event.target.value)}
            />
            <button
              type="submit"
              className="button button-quiet button-small"
              disabled={!activeType}
            >
              <FlaskConical size={15} /> Run test
            </button>
          </form>
          {message && (
            <p className="feature-success" role="status">
              <BookOpen size={15} /> {message}
            </p>
          )}
          {error && <ErrorNotice message={error} />}
        </FeaturePanel>
      )}
    </div>
  );
}
