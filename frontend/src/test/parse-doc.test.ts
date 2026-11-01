import { describe, it, expect } from "vitest";
import { buildTree } from "@/lib/parse-doc";

describe("parse-doc buildTree", () => {
  it("returns an empty tree for empty text", () => {
    expect(buildTree("")).toEqual([]);
    expect(buildTree("   \n\n   ")).toEqual([]);
  });

  it("builds section hierarchy from markdown headings", () => {
    const text = `# Project Title
This is the intro.

## Section 1
Details about section 1.

### Subsection 1.1
Deeper level note.

## Section 2
Final summary.`;

    const tree = buildTree(text);

    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("section");
    expect(tree[0].label).toBe("Project Title");

    // Children of Project Title: paragraph intro, Section 1, Section 2
    const rootChildren = tree[0].children!;
    expect(rootChildren.some((c) => c.type === "paragraph" && c.label.includes("intro"))).toBe(true);

    const sec1 = rootChildren.find((c) => c.label === "Section 1");
    expect(sec1).toBeDefined();
    expect(sec1?.children?.some((c) => c.label === "Subsection 1.1")).toBe(true);

    const sec2 = rootChildren.find((c) => c.label === "Section 2");
    expect(sec2).toBeDefined();
  });

  it("identifies tables containing pipes or tabs", () => {
    const markdown = `# Specification

| Field | Type | Description |
|---|---|---|
| id | string | Unique ID |`;

    const tree = buildTree(markdown);
    const sec = tree[0];
    const tableNode = sec.children?.find((c) => c.type === "table");
    expect(tableNode).toBeDefined();
    expect(tableNode?.label).toContain("| Field | Type | Description |");
  });

  it("parses numbered section headings (e.g. 1. Introduction)", () => {
    const text = `1. Introduction

Overview text here.

2. Scope

Detailed scope notes.`;

    const tree = buildTree(text);
    expect(tree.map((node) => node.label)).toEqual(["Introduction", "Scope"]);
  });

  it("truncates paragraphs exceeding 120 characters with ellipsis", () => {
    const longText =
      "SprintSmith accelerates software engineering by translating requirements into high-value testable artifacts including user stories, acceptance criteria, OpenAPI specifications, test cases, and sprint plans.";

    const tree = buildTree(longText);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("paragraph");
    expect(tree[0].label.endsWith("…")).toBe(true);
    expect(tree[0].label.length).toBe(121);
  });
});
