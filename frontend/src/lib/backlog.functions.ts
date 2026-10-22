import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { snapToFibonacci } from "./estimate";

export const estimateStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().min(3).max(200), description: z.string().max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const { estimateWithAi, AiError } = await import("./ai-estimate.server");
    try {
      return { ok: true as const, estimate: await estimateWithAi(data.title, data.description) };
    } catch (e) {
      return { ok: false as const, error: e instanceof AiError ? e.message : "Estimation failed." };
    }
  });

export const saveStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(4000),
        points: z.number(),
        confidence: z.number(),
        rationale: z.string(),
        risk: z.string(),
        criteria: z.array(z.string()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("backlog_stories")
      .insert({ ...data, points: snapToFibonacci(data.points), owner_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("backlog_stories")
      .select("id,title,points,confidence,criteria,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data.map((s) => ({ ...s, confidence: Number(s.confidence ?? 0), criteria: (s.criteria ?? []) as string[] }));
  });

export const deleteStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("backlog_stories").delete().eq("id", data.id);
    return { ok: true };
  });
