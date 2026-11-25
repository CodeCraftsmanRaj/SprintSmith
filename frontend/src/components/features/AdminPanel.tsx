import { useState } from "react";
import { Activity, Database, ServerCog, ShieldCheck, Users } from "lucide-react";
import { endpoints } from "@/lib/api/endpoints";
import type { AuditLog, HealthStatus } from "@/lib/api/types";
import { asRecord, asText, formatCount, formatDateTime, humanize } from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice, StatusBadge } from "./common";

interface AdminSnapshot {
  logs: AuditLog[];
  api: HealthStatus;
  database: HealthStatus;
  ai: HealthStatus;
}

export function AdminPanel({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const snapshot = useApiResource(async (signal) => {
    const [logs, api, database, ai] = await Promise.all([
      endpoints.analytics.auditLogs(),
      endpoints.analytics.health(),
      endpoints.analytics.databaseHealth(),
      endpoints.analytics.aiHealth(),
    ]);
    return { logs, api, database, ai } satisfies AdminSnapshot;
  }, []);

  async function runBatch() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await endpoints.analytics.batchEvaluate(projectId, "vector");
      const record = asRecord(result);
      setMessage(`Batch evaluation completed: ${asText(record["status"], "result returned")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Batch evaluation failed.");
    } finally {
      setBusy(false);
    }
  }

  function healthValue(value: HealthStatus | undefined): string {
    if (!value) return "—";
    return asText(
      value.status,
      asText(value.ok === true ? "ok" : value.ok === false ? "degraded" : null, "—"),
    );
  }

  return (
    <div className="feature-grid">
      <FeaturePanel
        kicker="ADMINISTRATION"
        title="System health"
        action={<ShieldCheck size={18} aria-hidden="true" />}
      >
        {snapshot.loading && <LoadingNotice label="Loading system health" />}
        {snapshot.error && <ErrorNotice message={snapshot.error} onRetry={snapshot.reload} />}
        {snapshot.data && (
          <div className="artifact-summary-strip">
            <div className="artifact-meta">
              <span>API</span>
              <b>{healthValue(snapshot.data.api)}</b>
            </div>
            <div className="artifact-meta">
              <span>Database</span>
              <b>{healthValue(snapshot.data.database)}</b>
            </div>
            <div className="artifact-meta">
              <span>AI engine</span>
              <b>{healthValue(snapshot.data.ai)}</b>
            </div>
            <div className="artifact-meta">
              <span>Audit events</span>
              <b>{formatCount(snapshot.data.logs.length)}</b>
            </div>
          </div>
        )}
        <ul className="feature-list compact">
          <li className="feature-list-row">
            <span>
              <Activity size={15} /> <b>API gateway</b>
            </span>
            <small>{healthValue(snapshot.data?.api)}</small>
          </li>
          <li className="feature-list-row">
            <span>
              <Database size={15} /> <b>Database</b>
            </span>
            <small>{healthValue(snapshot.data?.database)}</small>
          </li>
          <li className="feature-list-row">
            <span>
              <ServerCog size={15} /> <b>AI engine</b>
            </span>
            <small>{healthValue(snapshot.data?.ai)}</small>
          </li>
        </ul>
        {message && (
          <p className="feature-success" role="status">
            {message}
          </p>
        )}
        {error && <ErrorNotice message={error} />}
        <div className="feature-actions">
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => void runBatch()}
            disabled={busy || !projectId}
          >
            Run batch evaluation
          </button>
        </div>
      </FeaturePanel>

      <FeaturePanel kicker="SECURITY EVENTS" title="Audit log">
        {snapshot.loading && <LoadingNotice label="Loading audit log" />}
        {snapshot.error && <ErrorNotice message={snapshot.error} onRetry={snapshot.reload} />}
        {snapshot.data && snapshot.data.logs.length === 0 && (
          <EmptyNotice>No audit events were returned for this administrator.</EmptyNotice>
        )}
        {snapshot.data && snapshot.data.logs.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>ACTION</th>
                  <th>ACTOR</th>
                  <th>DETAILS</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.data.logs.map((log, index) => (
                  <tr key={log.id ?? index}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>
                      <StatusBadge value={humanize(asText(log.action, "event"))} />
                    </td>
                    <td>{asText(log.actor_id, "—").slice(0, 8)}</td>
                    <td>{asText(asRecord(log.details)["message"], "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="ACCESS CONTROL" title="User management">
        <div className="feature-error" role="status">
          <Users size={16} aria-hidden="true" />
          <span>
            The backend does not expose user list/create/disable endpoints. No user rows are shown
            because none can be verified. Admin role checks are enforced by the API.
          </span>
        </div>
        <p className="feature-footnote">
          Required contract: GET/POST/PATCH /api/v1/admin/users with disable and password-reset
          actions.
        </p>
      </FeaturePanel>
    </div>
  );
}
