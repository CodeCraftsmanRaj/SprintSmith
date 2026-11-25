import { afterEach, describe, expect, it, vi } from "vitest";
import { reportLovableError } from "@/lib/lovable-error-reporting";

afterEach(() => vi.unstubAllGlobals());

describe("editor runtime error reporting", () => {
  it("reports errors with location, caller context, stack, and a plain runtime payload", () => {
    const captureException = vi.fn();
    const runtime = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/projects/42" },
      __lovableEvents: { captureException },
      __lovableReportRuntimeError: runtime,
    });
    const error = new Error("loader failed");
    reportLovableError(error, { boundary: "test" });
    expect(captureException).toHaveBeenCalledWith(error, expect.objectContaining({ source: "react_error_boundary", route: "/projects/42", boundary: "test" }), expect.objectContaining({ handled: false, severity: "error" }));
    expect(runtime).toHaveBeenCalledWith(expect.objectContaining({ message: "loader failed", filename: "/projects/42", stack: error.stack }));
  });

  it.each([
    ["plain string", "plain string"],
    [{ message: "structured failure" }, "structured failure"],
    [{ code: "PGRST116", details: "missing row" }, '{"code":"PGRST116","details":"missing row"}'],
    [new Response("not found", { status: 404 }), "Response 404"],
    [null, "null"],
  ])("normalizes thrown values for editor telemetry", (thrown, message) => {
    const runtime = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/" }, __lovableReportRuntimeError: runtime });
    reportLovableError(thrown);
    expect(runtime).toHaveBeenCalledWith(expect.objectContaining({ message }));
  });

  it("bounds circular and very large object payloads without crashing telemetry", () => {
    const runtime = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/" }, __lovableReportRuntimeError: runtime });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    reportLovableError(circular);
    expect(runtime.mock.calls[0]![0].message).toBe("[object Object]");
    reportLovableError({ payload: "x".repeat(3000) });
    expect(runtime.mock.calls[1]![0].message).toHaveLength(2000);
  });

  it("does nothing when executed without a browser window", () => {
    vi.stubGlobal("window", undefined);
    expect(() => reportLovableError(new Error("server-side"))).not.toThrow();
  });
});
