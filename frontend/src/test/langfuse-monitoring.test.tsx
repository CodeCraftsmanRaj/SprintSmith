import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LangfuseMonitoring } from "@/components/LangfuseMonitoring";
import * as backendApi from "@/lib/backend-api";

type Observation = Record<string, unknown>;

const baseDashboard = {
  configured: true,
  langfuse_url: "https://langfuse.example.test/project",
  days: 7,
  truncated: false,
  observations: [] as Observation[],
};

function dashboard(overrides: Partial<typeof baseDashboard> = {}) {
  return { ...baseDashboard, ...overrides };
}

function observation(overrides: Observation = {}): Observation {
  return {
    id: "obs-1",
    traceId: "trace-1",
    type: "GENERATION",
    name: "Generate user story",
    traceName: "Requirement to story",
    startTime: "2026-01-02T10:00:00Z",
    endTime: "2026-01-02T10:00:02Z",
    model: "gpt-4o",
    level: "DEFAULT",
    input: { prompt: "Hello" },
    output: '{"answer":"ok"}',
    metadata: { request_id: "req-123" },
    totalUsage: 150,
    totalCost: 0.0042,
    ...overrides,
  };
}

function mockDashboard(payload: unknown) {
  return vi.spyOn(backendApi, "api").mockResolvedValue(payload as never);
}

function statCard(label: string): HTMLElement {
  return screen.getByText(label).closest("article") as HTMLElement;
}

function rowFor(title: string): HTMLElement {
  return screen.getByText(title).closest("tr") as HTMLElement;
}

describe("LangfuseMonitoring", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders the connection instructions when Langfuse is not configured", async () => {
    mockDashboard(dashboard({ configured: false }));
    render(<LangfuseMonitoring token="token" />);

    expect(await screen.findByText("Connect your Langfuse project")).toBeInTheDocument();
    expect(screen.getByText("LANGFUSE_ENABLED=true")).toBeInTheDocument();
    expect(screen.queryByText("Model calls")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open langfuse/i })).not.toBeInTheDocument();
  });

  it("summarizes calls, traces, tokens, cost, errors, and distinct models", async () => {
    mockDashboard(
      dashboard({
        observations: [
          observation({ id: "o1", traceId: "t1", totalUsage: 100, totalCost: 0.5, level: "DEFAULT" }),
          observation({
            id: "o2",
            traceId: "t1",
            totalUsage: 50,
            totalCost: 0.25,
            level: "ERROR",
            model: "gpt-4o-mini",
          }),
        ],
      }),
    );
    render(<LangfuseMonitoring token="token" />);

    expect(await screen.findByText("Model calls")).toBeInTheDocument();
    expect(within(statCard("Model calls")).getByText("2")).toBeInTheDocument();
    expect(within(statCard("Model calls")).getByText(/1 distinct traces · 7d/)).toBeInTheDocument();
    expect(within(statCard("Tokens used")).getByText("150")).toBeInTheDocument();
    expect(within(statCard("Estimated cost")).getByText("$0.750")).toBeInTheDocument();
    expect(within(statCard("Errors")).getByText("1")).toBeInTheDocument();
    expect(within(statCard("Errors")).getByText(/50.0% of calls/)).toBeInTheDocument();
    expect(within(statCard("Models")).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open langfuse/i })).toHaveAttribute(
      "href",
      "https://langfuse.example.test/project",
    );
  });

  it("renders usage, cost, and duration fallbacks for each generation row", async () => {
    mockDashboard(
      dashboard({
        observations: [
          observation({ id: "a", traceName: "Details total", totalUsage: undefined, usageDetails: { total: 30 }, totalCost: undefined, costDetails: { total: 0.001 } }),
          observation({ id: "b", traceName: "Split usage", totalUsage: undefined, inputUsage: 10, outputUsage: 5, totalCost: 2.5 }),
          observation({ id: "c", traceName: "Usage details", totalUsage: undefined, inputUsage: undefined, outputUsage: undefined, usageDetails: { input: 7, output: 3 }, totalCost: null }),
          observation({ id: "d", traceName: "Invalid usage", totalUsage: "not-a-number", totalCost: "bad" }),
          observation({ id: "e", traceName: "Missing duration", startTime: undefined, endTime: undefined }),
          observation({ id: "f", traceName: "Negative duration", startTime: "2026-01-02T10:00:05Z", endTime: "2026-01-02T10:00:00Z" }),
          observation({ id: "g", traceName: "Short duration", startTime: "2026-01-02T10:00:00Z", endTime: "2026-01-02T10:00:00.500Z" }),
        ],
      }),
    );
    render(<LangfuseMonitoring token="token" />);
    await screen.findByText("Details total");

    const details = within(rowFor("Details total")).getAllByRole("cell");
    expect(details[2]).toHaveTextContent("30");
    expect(details[3]).toHaveTextContent("$0.00100");
    expect(details[4]).toHaveTextContent("2.00 s");

    expect(within(rowFor("Split usage")).getAllByRole("cell")[2]).toHaveTextContent("15");
    expect(within(rowFor("Split usage")).getAllByRole("cell")[3]).toHaveTextContent("$2.500");
    expect(within(rowFor("Usage details")).getAllByRole("cell")[2]).toHaveTextContent("10");
    expect(within(rowFor("Usage details")).getAllByRole("cell")[3]).toHaveTextContent("$0.00000");
    expect(within(rowFor("Invalid usage")).getAllByRole("cell")[2]).toHaveTextContent("0");
    expect(within(rowFor("Invalid usage")).getAllByRole("cell")[3]).toHaveTextContent("$0.00000");
    expect(within(rowFor("Missing duration")).getAllByRole("cell")[4]).toHaveTextContent("—");
    expect(within(rowFor("Negative duration")).getAllByRole("cell")[4]).toHaveTextContent("0 ms");
    expect(within(rowFor("Short duration")).getAllByRole("cell")[4]).toHaveTextContent("500 ms");
  });

  it("filters rows by free-text search and model, and reports no matches", async () => {
    mockDashboard(
      dashboard({
        observations: [
          observation({ id: "a", name: "Alpha call", traceName: "Alpha trace", model: "model-a" }),
          observation({ id: "b", name: "Beta call", traceName: "Beta trace", model: "model-b" }),
          observation({ id: "c", name: "Gamma call", traceName: "Gamma trace", model: "model-b", metadata: { request_id: "gamma-request" } }),
        ],
      }),
    );
    render(<LangfuseMonitoring token="token" />);
    await screen.findByText("Alpha trace");

    const heading = screen.getByRole("heading", { name: /Generation calls/ });
    expect(heading).toHaveTextContent("3");

    fireEvent.change(screen.getByLabelText("Search traces"), { target: { value: "gamma-request" } });
    expect(heading).toHaveTextContent("1");
    expect(screen.getByText("Gamma trace")).toBeInTheDocument();
    expect(screen.queryByText("Alpha trace")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search traces"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by model"), { target: { value: "model-b" } });
    expect(heading).toHaveTextContent("2");
    expect(screen.queryByText("Alpha trace")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search traces"), { target: { value: "no-such-call" } });
    expect(heading).toHaveTextContent("0");
    expect(screen.getByText("No matching generations")).toBeInTheDocument();
  });

  it("expands trace details, formats inputs and outputs, and collapses again", async () => {
    mockDashboard(
      dashboard({
        observations: [
          observation({
            id: "expanded",
            traceName: "Expandable trace",
            input: { prompt: "hi" },
            output: '{"answer":"ok"}',
            statusMessage: "Provider timed out",
            inputUsage: 12,
            outputUsage: 8,
            usageDetails: { input: 1, output: 1 },
          }),
          observation({ id: "empty", traceName: undefined, name: undefined, input: null, output: "", metadata: undefined, traceId: undefined }),
          observation({ id: "raw", traceName: "Raw output trace", input: "", output: "plain text output" }),
        ],
      }),
    );
    render(<LangfuseMonitoring token="token" />);
    await screen.findByText("Expandable trace");

    fireEvent.click(screen.getAllByRole("button", { name: "Expand trace details" })[0]!);
    expect(screen.getByText("Model input")).toBeInTheDocument();
    expect(screen.getByText("Model output")).toBeInTheDocument();
    expect(screen.getByText(/"prompt": "hi"/)).toBeInTheDocument();
    expect(screen.getByText(/"answer": "ok"/)).toBeInTheDocument();
    expect(screen.getByText("Provider timed out")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getAllByText(/Request req-123/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Collapse trace details" }));
    expect(screen.queryByText("Model input")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Expand trace details" })[1]!);
    expect(screen.getAllByText("No data recorded").length).toBeGreaterThan(0);
    expect(screen.getByText("LLM generation")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Expand trace details" })[1]!);
    expect(screen.getByText("plain text output")).toBeInTheDocument();
  });

  it("renders empty chart and table states and the truncation notice", async () => {
    mockDashboard(dashboard({ truncated: true }));
    render(<LangfuseMonitoring token="token" />);

    expect(await screen.findByText("No token usage in this period yet.")).toBeInTheDocument();
    expect(screen.getByText("No model data recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No matching generations")).toBeInTheDocument();
    expect(screen.getByText(/Showing the newest 5,000 observations/)).toBeInTheDocument();
  });

  it("shows model counts and hourly trend data for a single-day window", async () => {
    const api = mockDashboard(
      dashboard({
        observations: [
          observation({ id: "a", traceName: "Hourly call", startTime: "2026-01-02T10:15:00Z" }),
          observation({ id: "b", traceName: "Unknown model call", model: undefined, startTime: "2026-01-02T11:15:00Z" }),
        ],
      }),
    );
    render(<LangfuseMonitoring token="token" />);
    await screen.findByText("Hourly call");

    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "1" } });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/v1/observability/langfuse?days=1", "token"),
    );
    expect(screen.queryByText("No token usage in this period yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("No model data recorded yet.")).not.toBeInTheDocument();
  });

  it("surfaces load errors, dismisses them, and refreshes on demand", async () => {
    const api = vi
      .spyOn(backendApi, "api")
      .mockResolvedValueOnce(dashboard() as never)
      .mockRejectedValueOnce(new Error("Langfuse unavailable"))
      .mockResolvedValueOnce(dashboard() as never);

    render(<LangfuseMonitoring token="token" />);
    await screen.findByText("Model calls");

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Langfuse unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Model calls")).toBeInTheDocument();
  });

  it("uses a friendly fallback for non-Error load failures", async () => {
    vi.spyOn(backendApi, "api").mockRejectedValue("offline");
    render(<LangfuseMonitoring token="token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load Langfuse data.");
  });
});
