import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/screens/workspace.tsx", "utf8");

describe("Workspace requirement text field", () => {
  it("associates its visible label with the textarea", () => {
    const label = workspace.match(/<label className="field-label"([^>]*)>Paste requirement text/);
    const textarea = workspace.match(/<textarea([^>]*)>/);

    expect(label?.[1]).toMatch(/htmlFor="requirement-text"/);
    expect(textarea?.[1]).toMatch(/id="requirement-text"/);
  });
});
