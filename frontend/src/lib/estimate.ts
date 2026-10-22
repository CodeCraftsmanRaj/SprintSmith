import { z } from "zod";

export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const;

/** Snap any number to the nearest allowed story-point value (1–21 Fibonacci). */
export function snapToFibonacci(n: number): number {
  if (!Number.isFinite(n)) return 3;
  let best: number = FIBONACCI[0];
  for (const f of FIBONACCI) if (Math.abs(f - n) < Math.abs(best - n)) best = f;
  return best;
}

export const estimateSchema = z.object({
  points: z.number(),
  confidence: z.number(),
  rationale: z.string(),
  risk: z.string(),
  criteria: z.array(z.string()),
});

export type Estimate = z.infer<typeof estimateSchema>;

export function normalizeEstimate(e: Estimate): Estimate {
  return {
    ...e,
    points: snapToFibonacci(e.points),
    confidence: Math.min(1, Math.max(0, e.confidence)),
    criteria: e.criteria.filter((c) => c.trim()).slice(0, 6),
  };
}
