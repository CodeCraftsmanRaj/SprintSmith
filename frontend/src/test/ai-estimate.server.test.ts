import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providerOptions: undefined as Record<string, unknown> | undefined,
  output: undefined as Promise<unknown> | undefined,
  fetcher: undefined as typeof fetch | undefined,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (options: { fetch: typeof fetch }) => {
    mocks.fetcher = options.fetch;
    return { responses: vi.fn((model: string) => model) };
  },
}));

vi.mock("ai", () => ({
  Output: { object: vi.fn((options: unknown) => options) },
  streamText: vi.fn((options: { providerOptions: Record<string, unknown> }) => {
    mocks.providerOptions = options.providerOptions;
    return { output: mocks.output };
  }),
}));

import { AiError, estimateWithAi } from "@/lib/ai-estimate.server";

const estimate = {
  points: 5,
  confidence: 0.8,
  rationale: "Moderate effort.",
  risk: "Integration risk.",
  criteria: ["Given a user When they save Then it persists"],
};

describe("estimateWithAi", () => {
  beforeEach(() => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    mocks.output = Promise.resolve(estimate);
    mocks.fetcher = undefined;
    mocks.providerOptions = undefined;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requires an API key", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    await expect(estimateWithAi("Story", "Details")).rejects.toMatchObject({
      name: "Error",
      message: "AI is not configured.",
      status: 401,
    });
  });

  it("normalizes successful AI output and applies request instructions", async () => {
    const result = await estimateWithAi("Story", "Details");
    expect(result.points).toBe(5);
    expect(result.confidence).toBe(0.8);
    expect(mocks.providerOptions).toMatchObject({
      openai: { forceReasoning: true, reasoningEffort: "low", store: false },
    });
  });

  it.each([
    [402, "AI credits have run out. Add credits to keep estimating."],
    [429, "Too many requests right now. Please try again in a minute."],
    [403, "The AI request was not allowed."],
  ])("maps gateway status %i to a useful error", async (status, message) => {
    await estimateWithAi("Story", "Details");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(mocks.fetcher!("https://gateway.test", { headers: {} })).rejects.toMatchObject({ status, message });
  });

  it("adds the run id to later gateway requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 200, headers: { "X-Lovable-AIG-Run-ID": "run-123" } }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await estimateWithAi("Story", "Details");
    await mocks.fetcher!("https://gateway.test", { headers: {} });
    await mocks.fetcher!("https://gateway.test", { headers: {} });
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("X-Lovable-AIG-Run-ID")).toBe("run-123");
  });

  it("preserves nested AI errors and wraps unknown failures", async () => {
    const aiError = new AiError("already classified", 429);
    mocks.output = Promise.reject(new Error("wrapper", { cause: new Error("inner", { cause: aiError }) }));
    await expect(estimateWithAi("Story", "Details")).rejects.toBe(aiError);

    mocks.output = Promise.reject(new Error("bad response"));
    await expect(estimateWithAi("Story", "Details")).rejects.toMatchObject({
      message: "The AI could not produce an estimate. Try adding more detail.",
      status: 500,
    });
  });
});
