import { describe, expect, it } from "vitest";
import * as audit from "@/screens/audit";
import * as ingest from "@/screens/ingest";
import * as login from "@/screens/login";
import * as overview from "@/screens/overview";
import * as plan from "@/screens/plan";
import * as prompts from "@/screens/prompts";
import * as shellModule from "@/screens/shell";
import * as synthesize from "@/screens/synthesize";
import * as verify from "@/screens/verify";

describe("static screen templates", () => {
  it.each([
    ["audit log", audit, "Audit Log"],
    ["document ingestion", ingest, "Docling"],
    ["sign in", login, "Sign in"],
    ["overview", overview, "Overview"],
    ["sprint planning", plan, "Sprint Backlog"],
    ["prompt library", prompts, "Prompt"],
    ["artifact synthesis", synthesize, "Synthesize"],
    ["verification", verify, "Verification"],
  ])("exports the expected %s page markup", (_label, screen, expected) => {
    expect(screen.html).toContain(expected);
    expect(screen.bodyClass).toContain("bg-surface");
    expect(screen.script).toBeTypeOf("string");
  });

  it("marks the selected navigation entry in the shared shell", () => {
    expect(shellModule.shell("overview", "<h1>Overview panel</h1>")).toContain(
      'aria-current="page" class=',
    );
    expect(shellModule.shell("overview", "<h1>Overview panel</h1>")).toContain(
      "Overview panel",
    );
  });
});
