import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/backend-api";
import { LangfuseMonitoring } from "@/components/LangfuseMonitoring";

vi.mock("@/lib/backend-api", () => ({ api: vi.fn() }));
vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => null,
  Bar: () => null,
  BarChart: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const apiMock = vi.mocked(api);

const dashboard = {
  configured: true,
  langfuse_url: "https://cloud.langfuse.com",
  days: 7,
  truncated: true,
  observations: [
    {
      id: "observation-1",
      traceId: "trace-1",
      name: "Generate story",
      model: "zeta-model",
      startTime: "2026-11-24T10:00:00.000Z",
      endTime: "2026-11-24T10:00:00.250Z",
      input: '{"requirement":"login"}',
      output: { result: "done" },
      metadata: { request_id: "request-123" },
      inputUsage: 10,
      outputUsage: 20,
      totalUsage: 30,
      totalCost: 0.0001,
      level: "ERROR",
      statusMessage: "Provider timed out",
    },
    {
      id: "observation-2",
      traceId: "trace-1",
      traceName: "Judge story",
      model: "alpha-model",
      startTime: "2026-11-24T10:01:00.000Z",
      endTime: "2026-11-24T10:03:00.000Z",
      usageDetails: { input: 3, output: 5, total: 8 },
      costDetails: { total: 0.02 },
      level: "DEFAULT",
    },
    {
      id: "observation-3",
      name: "Draft story",
      model: "zeta-model",
      inputUsage: 2,
      outputUsage: 4,
      totalCost: "0.002",
      startTime: "2026-11-24T10:02:00.000Z",
    },
  ],
};

describe("LangfuseMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.mockResolvedValue(dashboard as never);
  });

  it("shows setup guidance when Langfuse is not configured", async () => {
    apiMock.mockResolvedValueOnce({
      configured: false,
      langfuse_url: "https://cloud.langfuse.com",
      days: 7,
      observations: [],
      truncated: false,
    } as never);

    render(<LangfuseMonitoring token="admin-token" />);

    expect(await screen.findByText("Connect your Langfuse project")).toBeInTheDocument();
    expect(screen.getByText("LANGFUSE_ENABLED=true")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open langfuse/i })).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/api/v1/observability/langfuse?days=7", "admin-token");
  });

  it("summarizes usage and opens trace details", async () => {
    render(<LangfuseMonitoring token="admin-token" />);

    expect(await screen.findByText("Langfuse monitoring")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
    expect(screen.getByText("33.3% of calls")).toBeInTheDocument();
    expect(screen.getByText("1 distinct traces · 7d")).toBeInTheDocument();
    expect(screen.getByText(/Showing the newest 5,000 observations/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open langfuse/i })).toHaveAttribute(
      "href",
      "https://cloud.langfuse.com",
    );

    const generation = screen.getByText("Generate story").closest("tr");
    expect(generation).not.toBeNull();
    expect(within(generation as HTMLTableRowElement).getByText("30")).toBeInTheDocument();
    expect(within(generation as HTMLTableRowElement).getByText("Error")).toBeInTheDocument();
    expect(within(generation as HTMLTableRowElement).getByText("250 ms")).toBeInTheDocument();

    fireEvent.click(within(generation as HTMLTableRowElement).getByRole("button", { name: "Expand trace details" }));
    expect(screen.getByText("Model input")).toBeInTheDocument();
    expect(screen.getByText(/"requirement": "login"/)).toBeInTheDocument();
    expect(screen.getByText("Provider timed out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse trace details" })).toBeInTheDocument();
  });

  it("filters observations by model and search text", async () => {
    render(<LangfuseMonitoring token="admin-token" />);
    await screen.findByText("Generate story");

    const modelFilter = screen.getByLabelText("Filter by model");
    expect(modelFilter.querySelectorAll("option")).toHaveLength(3);
    fireEvent.change(modelFilter, { target: { value: "alpha-model" } });
    expect(screen.getByText("Judge story")).toBeInTheDocument();
    expect(screen.queryByText("Generate story")).not.toBeInTheDocument();

    fireEvent.change(modelFilter, { target: { value: "all" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search traces" }), {
      target: { value: "request-123" },
    });
    expect(screen.getByText("Generate story")).toBeInTheDocument();
    expect(screen.queryByText("Judge story")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search traces" }), {
      target: { value: "does-not-exist" },
    });
    expect(screen.getByText("No matching generations")).toBeInTheDocument();
  });

  it("reloads for a selected range and supports manual refresh", async () => {
    render(<LangfuseMonitoring token="admin-token" />);
    await screen.findByText("Langfuse monitoring");

    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "1" } });
    await waitFor(() => expect(apiMock).toHaveBeenLastCalledWith(
      "/api/v1/observability/langfuse?days=1",
      "admin-token",
    ));

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(3));
  });

  it("shows and dismisses request errors", async () => {
    apiMock.mockRejectedValueOnce(new Error("Backend unavailable"));
    render(<LangfuseMonitoring token="admin-token" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Backend unavailable");
    fireEvent.click(within(alert).getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    apiMock.mockRejectedValueOnce("unexpected failure");
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load Langfuse data.");
  });

  it("renders empty usage and handles malformed or missing values", async () => {
    apiMock.mockResolvedValueOnce({
      configured: true,
      langfuse_url: "https://cloud.langfuse.com",
      days: 7,
      truncated: false,
      observations: [{
        id: "empty-row",
        input: "not-json",
        output: null,
        model: undefined,
        totalUsage: "not-a-number",
        totalCost: null,
        level: "DEFAULT",
      }],
    } as never);

    render(<LangfuseMonitoring token="admin-token" />);

    expect(await screen.findByText("No token usage in this period yet.")).toBeInTheDocument();
    expect(screen.queryByText("No model data recorded yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand trace details" }));
    expect(screen.getByText("not-json")).toBeInTheDocument();
    expect(screen.getAllByText("No data recorded")).toHaveLength(1);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the empty-state charts when there are no observations", async () => {
    apiMock.mockResolvedValueOnce({
      configured: true,
      langfuse_url: "https://cloud.langfuse.com",
      days: 7,
      observations: [],
      truncated: false,
    } as never);

    render(<LangfuseMonitoring token="admin-token" />);

    expect(await screen.findByText("No token usage in this period yet.")).toBeInTheDocument();
    expect(screen.getByText("No model data recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No matching generations")).toBeInTheDocument();
    expect(screen.getByText("0.0% of calls")).toBeInTheDocument();
  });
});
