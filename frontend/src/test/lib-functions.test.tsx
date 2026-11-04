import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================
// snapToFibonacci + normalizeEstimate
// ============================================================
import { snapToFibonacci, normalizeEstimate, FIBONACCI } from "@/lib/estimate";

describe("snapToFibonacci", () => {
  it("snaps to nearest Fibonacci number", () => {
    expect(snapToFibonacci(1)).toBe(1);
    expect(snapToFibonacci(2)).toBe(2);
    expect(snapToFibonacci(3)).toBe(3);
    expect(snapToFibonacci(4)).toBe(3);
    expect(snapToFibonacci(5)).toBe(5);
    expect(snapToFibonacci(10)).toBe(8);
    expect(snapToFibonacci(21)).toBe(21);
  });

  it("returns 3 for NaN and Infinity", () => {
    expect(snapToFibonacci(NaN)).toBe(3);
    expect(snapToFibonacci(Infinity)).toBe(3);
    expect(snapToFibonacci(-Infinity)).toBe(3);
  });

  it("returns 1 for 0", () => {
    expect(snapToFibonacci(0)).toBe(1);
  });

  it("returns 1 for negative numbers", () => {
    expect(snapToFibonacci(-5)).toBe(1);
  });
});

describe("normalizeEstimate", () => {
  it("normalizes points to Fibonacci", () => {
    const result = normalizeEstimate({
      points: 4,
      confidence: 0.5,
      rationale: "test",
      risk: "low",
      criteria: ["a", "b"],
    });
    expect(result.points).toBe(3);
  });

  it("clamps confidence to [0, 1]", () => {
    const result = normalizeEstimate({
      points: 5,
      confidence: 1.5,
      rationale: "test",
      risk: "low",
      criteria: [],
    });
    expect(result.confidence).toBe(1);

    const result2 = normalizeEstimate({
      points: 5,
      confidence: -0.5,
      rationale: "test",
      risk: "low",
      criteria: [],
    });
    expect(result2.confidence).toBe(0);
  });

  it("filters empty criteria and limits to 6", () => {
    const result = normalizeEstimate({
      points: 5,
      confidence: 0.5,
      rationale: "test",
      risk: "low",
      criteria: ["a", "", "b", "   ", "c", "d", "e", "f", "g"],
    });
    expect(result.criteria).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

// ============================================================
// describeError + consumeLastCapturedError
// ============================================================
import {
  describeError,
  consumeLastCapturedError,
} from "@/lib/error-capture";

describe("describeError", () => {
  it("returns message for Error", () => {
    const err = new Error("something went wrong");
    expect(describeError(err)).toContain("something went wrong");
  });

  it("returns string for string input", () => {
    expect(describeError("plain string")).toBe("plain string");
  });

  it("handles plain objects", () => {
    const result = describeError({ foo: "bar" });
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("handles null/undefined", () => {
    expect(describeError(null)).toBeDefined();
    expect(describeError(undefined)).toBeDefined();
  });

  it("includes status for HTTP-like errors", () => {
    const err: any = new Error("HTTP error");
    err.status = 500;
    expect(describeError(err)).toContain("(status 500)");
  });

  it("handles cause chain", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    const result = describeError(outer);
    expect(result).toContain("outer");
    expect(result).toContain("inner");
  });
});

describe("consumeLastCapturedError", () => {
  it("returns undefined when no error captured", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });
});

// ============================================================
// reportLovableError
// ============================================================
import { reportLovableError } from "@/lib/lovable-error-reporting";

describe("reportLovableError", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      __lovableEvents: undefined,
      __lovableReportRuntimeError: undefined,
      location: { pathname: "/test" },
    } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not throw when called", () => {
    expect(() => reportLovableError(new Error("test"))).not.toThrow();
  });

  it("calls window.__lovableEvents.captureException when available", () => {
    const captureException = vi.fn();
    vi.stubGlobal("window", {
      __lovableEvents: { captureException },
      __lovableReportRuntimeError: undefined,
      location: { pathname: "/test" },
    } as any);

    reportLovableError(new Error("test error"), { key: "value" });
    expect(captureException).toHaveBeenCalled();
  });
});

// ============================================================
// supabase client
// ============================================================
import { supabase } from "@/integrations/supabase/client";

describe("supabase client", () => {
  it("exports a supabase client proxy", () => {
    expect(supabase).toBeDefined();
  });
});

// ============================================================
// useIsMobile hook
// ============================================================
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
    })));
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defined value", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBeDefined();
  });

  it("adds matchMedia change listener", () => {
    const mockMql = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mockMql));
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 500 });
    const { result } = renderHook(() => useIsMobile());
    expect(mockMql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
