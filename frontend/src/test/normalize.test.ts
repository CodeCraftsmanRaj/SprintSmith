import { describe, expect, it } from "vitest";
import {
  asArray,
  asBoolean,
  asNumber,
  asNullableNumber,
  asRecord,
  asText,
  filenameFromContentDisposition,
  formatCount,
  formatDate,
  formatScore,
  normalizeList,
  safeExternalHref,
  uniqueStrings,
} from "@/lib/normalize";

describe("normalize", () => {
  it("never throws on null, undefined or primitive API payloads", () => {
    for (const value of [undefined, null, 0, "text", true, 42]) {
      expect(asRecord(value)).toEqual({});
      expect(asArray(value)).toEqual([]);
    }
  });

  it("converts numbers only when they are finite", () => {
    expect(asNumber("12.5")).toBe(12.5);
    expect(asNumber(Number.NaN, 7)).toBe(7);
    expect(asNumber(undefined, 4)).toBe(4);
    expect(asNullableNumber("not-a-number")).toBeNull();
    expect(asNullableNumber(null)).toBeNull();
  });

  it("preserves text and boolean values with safe fallbacks", () => {
    expect(asText(123)).toBe("123");
    expect(asText(undefined, "fallback")).toBe("fallback");
    expect(asBoolean("true")).toBe(false);
    expect(asBoolean(true)).toBe(true);
  });

  it("formats counts and scores without calling methods on missing fields", () => {
    expect(formatCount(undefined)).toBe("—");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatScore(undefined)).toBe("Not evaluated");
    expect(formatScore(null)).toBe("Not evaluated");
    expect(formatScore(0.8765)).toBe("0.88");
  });

  it("formats dates safely", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("invalid-date")).toBe("—");
    expect(formatDate("2026-01-02T00:00:00Z")).toContain("2026");
  });

  it("maps only real array entries and removes duplicate tags", () => {
    expect(normalizeList([{ id: "1" }, null, "bad"], (item) => asText(item["id"]) || null)).toEqual(
      ["1"],
    );
    expect(uniqueStrings(["a", "", "a", null, " b "])).toEqual(["a", "b"]);
  });

  it("extracts safe download filenames", () => {
    expect(filenameFromContentDisposition('attachment; filename="report.md"', "fallback")).toBe(
      "report.md",
    );
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''spec%20v1.yaml", "fallback"),
    ).toBe("spec v1.yaml");
    expect(
      filenameFromContentDisposition('attachment; filename="../../etc/passwd"', "fallback"),
    ).toBe("passwd");
    expect(filenameFromContentDisposition(undefined, "fallback")).toBe("fallback");
  });

  it("rejects unsafe external links", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("//evil.example")).toBeNull();
    expect(safeExternalHref("https://example.com/docs")).toContain("https://example.com/docs");
  });
});
