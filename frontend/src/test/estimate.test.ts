import { describe, it, expect } from "vitest";
import {
  snapToFibonacci,
  normalizeEstimate,
  estimateSchema,
  FIBONACCI,
} from "@/lib/estimate";

describe("estimate utilities", () => {
  describe("snapToFibonacci", () => {
    it("returns exact matches for all allowed Fibonacci values", () => {
      FIBONACCI.forEach((n) => {
        expect(snapToFibonacci(n)).toBe(n);
      });
    });

    it("snaps lower values and 0 to 1", () => {
      expect(snapToFibonacci(0)).toBe(1);
      expect(snapToFibonacci(-5)).toBe(1);
    });

    it("snaps in-between numbers to nearest Fibonacci", () => {
      expect(snapToFibonacci(4)).toBe(3); // |3 - 4| = 1, |5 - 4| = 1 -> best is 3
      expect(snapToFibonacci(6)).toBe(5);
      expect(snapToFibonacci(7)).toBe(8);
      expect(snapToFibonacci(10)).toBe(8);
      expect(snapToFibonacci(11)).toBe(13);
      expect(snapToFibonacci(18)).toBe(21);
      expect(snapToFibonacci(100)).toBe(21);
    });

    it("returns 3 for non-finite values (NaN, Infinity, -Infinity)", () => {
      expect(snapToFibonacci(NaN)).toBe(3);
      expect(snapToFibonacci(Infinity)).toBe(3);
      expect(snapToFibonacci(-Infinity)).toBe(3);
    });
  });

  describe("normalizeEstimate", () => {
    it("snaps points and clamps confidence between 0 and 1", () => {
      const result = normalizeEstimate({
        points: 4,
        confidence: 1.5,
        rationale: "Complex logic",
        risk: "Low",
        criteria: ["Valid input", "Error handling"],
      });

      expect(result.points).toBe(3);
      expect(result.confidence).toBe(1);
    });

    it("clamps negative confidence to 0", () => {
      const result = normalizeEstimate({
        points: 13,
        confidence: -0.2,
        rationale: "Uncertain",
        risk: "High",
        criteria: ["Edge cases"],
      });

      expect(result.confidence).toBe(0);
    });

    it("filters out empty or whitespace-only criteria and truncates to at most 6", () => {
      const result = normalizeEstimate({
        points: 8,
        confidence: 0.85,
        rationale: "Well scoped",
        risk: "Medium",
        criteria: [
          "Crit 1",
          "",
          "  ",
          "Crit 2",
          "Crit 3",
          "Crit 4",
          "Crit 5",
          "Crit 6",
          "Crit 7 extra",
        ],
      });

      expect(result.criteria).toEqual([
        "Crit 1",
        "Crit 2",
        "Crit 3",
        "Crit 4",
        "Crit 5",
        "Crit 6",
      ]);
    });
  });

  describe("estimateSchema", () => {
    it("validates well-formed estimate objects", () => {
      const valid = {
        points: 5,
        confidence: 0.9,
        rationale: "Standard CRUD operations",
        risk: "Low",
        criteria: ["Response code 200", "Validation error 400"],
      };

      const parsed = estimateSchema.parse(valid);
      expect(parsed).toEqual(valid);
    });

    it("fails on missing or wrongly typed properties", () => {
      expect(() =>
        estimateSchema.parse({
          points: "five",
          confidence: 1,
        }),
      ).toThrow();
    });
  });
});
