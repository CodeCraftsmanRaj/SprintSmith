import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/screens/workspace.tsx", "utf8");

describe("Workspace requirement text field", () => {
  it("associates its visible label with the textarea", () => {
    const requirementField = workspace.match(
      /<label className="field-label" htmlFor="requirement-text">Paste requirement text[\s\S]*?<\/label>\s*<textarea id="requirement-text"/,
    );

    expect(requirementField).not.toBeNull();
  });
});
