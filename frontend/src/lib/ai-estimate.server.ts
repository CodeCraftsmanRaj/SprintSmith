import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { estimateSchema, normalizeEstimate, type Estimate } from "./estimate";

export class AiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function estimateWithAi(title: string, description: string): Promise<Estimate> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI is not configured.", 401);
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (res.status === 402) throw new AiError("AI credits have run out. Add credits to keep estimating.", 402);
      if (res.status === 429) throw new AiError("Too many requests right now. Please try again in a minute.", 429);
      if (res.status === 403) throw new AiError("The AI request was not allowed.", 403);
      return res;
    },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    maxRetries: 0,
    instructions:
      "You are an agile estimation assistant for a banking engineering team. Estimate the user story in Fibonacci story points (1,2,3,5,8,13,21), give a confidence between 0 and 1, a 1-3 sentence rationale, a one-sentence risk note, and 3-6 acceptance criteria written as 'Given … When … Then …'.",
    messages: [{ role: "user", content: `Title: ${title}\n\nDescription:\n${description || "(none)"}` }],
    output: Output.object({ schema: estimateSchema }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    const out = await result.output;
    return normalizeEstimate(out);
  } catch (e) {
    let err: unknown = e;
    while (err && !(err instanceof AiError) && (err as { cause?: unknown }).cause) err = (err as { cause?: unknown }).cause;
    if (err instanceof AiError) throw err;
    console.error(e);
    throw new AiError("The AI could not produce an estimate. Try adding more detail.", 500);
  }
}
