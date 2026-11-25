import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPanel } from "@/components/features/AdminPanel";
import { OpenApiPreview } from "@/components/features/ArtifactTools";
import { TraceabilityView } from "@/components/features/TraceabilityView";

function respond(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(payload),
    blob: vi.fn().mockResolvedValue(new Blob(["x"])),
    clone() {
      return this;
    },
  } as unknown as Response;
}

describe("integrated feature panels", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(respond({})) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders real OpenAPI artifact content instead of placeholder data", () => {
    render(
      <OpenApiPreview
        artifact={{
          id: "artifact-1",
          title: "Payments API",
          artifact_type: "api_spec",
          version: 1,
          created_at: "2026-11-25T00:00:00Z",
          content: {
            endpoints: [
              {
                method: "get",
                path: "/payments",
                summary: "List payments",
                response_code: 200,
              },
            ],
            schemas: [{ name: "Payment" }],
          },
        }}
      />,
    );

    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getByText("/payments")).toBeInTheDocument();
    expect(screen.getByText("List payments")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
  });

  it("derives traceability coverage from backend-returned nodes and links", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      respond({
        nodes: [
          {
            id: "req-1",
            type: "requirement",
            data: { label: "Requirement R1" },
            position: { x: 60, y: 60 },
          },
          {
            id: "artifact-1",
            type: "user_story",
            data: { label: "Story S1" },
            position: { x: 300, y: 60 },
          },
        ],
        edges: [{ id: "edge-1", source: "req-1", target: "artifact-1" }],
      }),
    ) as typeof fetch;

    render(<TraceabilityView projectId="project-1" />);

    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText("Requirement R1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Story S1").length).toBeGreaterThan(0);
    const linked = await screen.findAllByLabelText("linked");
    expect(linked).toHaveLength(1);
  });

  it("shows health and audit data from the admin endpoints and runs batch evaluation", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/audit-logs")) {
        return respond([
          {
            id: "log-1",
            action: "user_login",
            actor_id: "admin-1",
            details: { message: "Signed in" },
            created_at: "2026-11-25T10:00:00Z",
          },
        ]);
      }
      if (url.includes("/health/ai")) return respond({ status: "degraded" });
      if (url.includes("/health/db")) return respond({ status: "ok" });
      if (url.endsWith("/health")) return respond({ status: "ok" });
      if (url.includes("/evaluate/batch")) return respond({ status: "completed" });
      return respond({});
    }) as typeof fetch;

    render(<AdminPanel projectId="project-1" />);

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect((await screen.findAllByText("degraded")).length).toBeGreaterThan(0);
    expect(screen.getByText("user login")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /run batch evaluation/i }));

    expect(await screen.findByText(/Batch evaluation completed: completed/i)).toBeInTheDocument();
  });
});
