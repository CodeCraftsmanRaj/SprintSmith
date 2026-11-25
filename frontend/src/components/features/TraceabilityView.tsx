import { Network } from "lucide-react";
import { endpoints } from "@/lib/api/endpoints";
import type { TraceabilityEdge, TraceabilityNode } from "@/lib/api/types";
import { asNumber, asRecord, asText, formatCount } from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice } from "./common";

const MAX_MATRIX_ITEMS = 12;

function isRequirement(node: TraceabilityNode): boolean {
  return asText(node.type) === "requirement" || asText(node.id).startsWith("req-");
}

function labelFor(node: TraceabilityNode): string {
  const data = asRecord(node.data);
  return asText(data["label"], asText(node.id, "Unnamed node"));
}

function percentage(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return `${(asNumber(value, 0) * 100).toFixed(0)}%`;
}

export function TraceabilityView({ projectId }: { projectId: string }) {
  const graph = useApiResource((signal) => endpoints.traceability.graph(projectId), [projectId]);

  const nodes = graph.data?.nodes ?? [];
  const edges = graph.data?.edges ?? [];
  const requirements = nodes.filter(isRequirement);
  const artifacts = nodes.filter((node) => !isRequirement(node));
  const requirementIds = new Set(requirements.map((node) => node.id));
  const artifactIds = new Set(artifacts.map((node) => node.id));
  const linkedRequirements = new Set(
    edges
      .filter((edge) => requirementIds.has(edge.source) && artifactIds.has(edge.target))
      .map((edge) => edge.source),
  );
  const coverage = requirements.length ? linkedRequirements.size / requirements.length : null;

  const positions = nodes.map((node, index) => {
    const record = asRecord(node.position);
    return {
      node,
      x: asNumber(record["x"], 60 + (index % 4) * 210),
      y: asNumber(record["y"], 60 + Math.floor(index / 4) * 120),
    };
  });
  const maxY = positions.reduce((max, item) => Math.max(max, item.y), 60);
  const coordinate = new Map(positions.map((item) => [item.node.id, item]));

  return (
    <div className="feature-grid">
      <FeaturePanel kicker="TRACEABILITY" title="Requirement to artifact graph">
        {graph.loading && <LoadingNotice label="Loading traceability" />}
        {graph.error && <ErrorNotice message={graph.error} onRetry={graph.reload} />}
        {!graph.loading && !graph.error && nodes.length === 0 && (
          <EmptyNotice>No traceability data was returned for this project.</EmptyNotice>
        )}
        {nodes.length > 0 && (
          <>
            <div className="artifact-summary-strip">
              <div className="artifact-meta">
                <span>Requirements</span>
                <b>{formatCount(requirements.length)}</b>
              </div>
              <div className="artifact-meta">
                <span>Artifacts</span>
                <b>{formatCount(artifacts.length)}</b>
              </div>
              <div className="artifact-meta">
                <span>Links</span>
                <b>{formatCount(edges.length)}</b>
              </div>
              <div className="artifact-meta">
                <span>Coverage</span>
                <b>{percentage(coverage)}</b>
              </div>
            </div>
            <div className="table-scroll traceability-canvas">
              <svg
                viewBox={`0 0 870 ${maxY + 120}`}
                role="img"
                aria-labelledby="traceability-title traceability-description"
              >
                <title id="traceability-title">Traceability graph</title>
                <desc id="traceability-description">
                  {requirements.length} requirements connected to {artifacts.length} artifacts by{" "}
                  {edges.length} links.
                </desc>
                {edges.map((edge: TraceabilityEdge, index) => {
                  const from = coordinate.get(edge.source);
                  const to = coordinate.get(edge.target);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={edge.id ?? `edge-${index}`}
                      x1={from.x + 80}
                      y1={from.y + 24}
                      x2={to.x}
                      y2={to.y + 24}
                      className="trace-edge"
                    />
                  );
                })}
                {positions.map(({ node, x, y }) => (
                  <g key={node.id} transform={`translate(${x}, ${y})`}>
                    <rect
                      width="160"
                      height="48"
                      rx="8"
                      className={
                        isRequirement(node) ? "trace-node requirement" : "trace-node artifact"
                      }
                    />
                    <text x="12" y="20" className="trace-node-label">
                      {labelFor(node).slice(0, 22)}
                    </text>
                    <text x="12" y="37" className="trace-node-kind">
                      {asText(node.type, "artifact")}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <p className="feature-footnote">
              Coverage is derived only from links returned by the backend. Missing or partial data
              is shown as "—".
            </p>
          </>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="MATRIX" title="Coverage matrix">
        {nodes.length === 0 ? (
          <EmptyNotice>No matrix rows are available.</EmptyNotice>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>REQUIREMENT</th>
                  {artifacts.slice(0, MAX_MATRIX_ITEMS).map((node) => (
                    <th key={node.id}>{labelFor(node).slice(0, 16)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requirements.slice(0, MAX_MATRIX_ITEMS).map((requirement) => (
                  <tr key={requirement.id}>
                    <td>
                      <b>{labelFor(requirement)}</b>
                    </td>
                    {artifacts.slice(0, MAX_MATRIX_ITEMS).map((artifact) => {
                      const linked = edges.some(
                        (edge) => edge.source === requirement.id && edge.target === artifact.id,
                      );
                      return (
                        <td key={artifact.id} aria-label={linked ? "linked" : "not linked"}>
                          {linked ? "●" : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(requirements.length > MAX_MATRIX_ITEMS || artifacts.length > MAX_MATRIX_ITEMS) && (
          <p className="feature-footnote">
            Showing the first {MAX_MATRIX_ITEMS} requirements and artifacts. Use the graph above for
            the full set.
          </p>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="ACCESSIBLE LIST" title="Links">
        {edges.length === 0 ? (
          <EmptyNotice>
            <Network size={15} /> No links were returned.
          </EmptyNotice>
        ) : (
          <ul className="feature-list compact">
            {edges.map((edge, index) => (
              <li key={edge.id ?? index} className="feature-list-row">
                <span>{labelFor({ id: edge.source, type: "requirement" })}</span>
                <span>→</span>
                <span>{labelFor({ id: edge.target, type: "artifact" })}</span>
              </li>
            ))}
          </ul>
        )}
      </FeaturePanel>
    </div>
  );
}
