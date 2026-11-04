import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ============================================================
// Integrations - Supabase
// ============================================================

// client.ts - test the helper functions
import { stripTrailingSlashes } from "@/integrations/supabase/client";

describe("supabase client helpers", () => {
  it("strips trailing slashes", () => {
    expect(stripTrailingSlashes("https://example.com")).toBe("https://example.com");
    expect(stripTrailingSlashes("https://example.com/")).toBe("https://example.com");
    expect(stripTrailingSlashes("https://example.com///")).toBe("https://example.com");
    expect(stripTrailingSlashes("")).toBe("");
  });
});

// ============================================================
// Hooks
// ============================================================

// ============================================================
// Routes
// ============================================================

// ============================================================
// Server files
// ============================================================

// server.ts
import { startServer } from "@/server";
describe("server", () => {
  it("exports startServer", () => {
    expect(typeof startServer).toBe("function");
  });
});

// start.ts
import { initializeApp } from "@/start";
describe("start", () => {
  it("exports initializeApp", () => {
    expect(typeof initializeApp).toBe("function");
  });
});

// router.tsx
import { router } from "@/router";
describe("router", () => {
  it("exports router", () => {
    expect(router).toBeDefined();
  });
});

// ============================================================
// Components
// ============================================================

// Screen.tsx
import { Screen } from "@/components/Screen";
describe("Screen component", () => {
  it("renders screen with children", () => {
    render(<Screen>Content</Screen>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});

// GenerateArtifactModal
import { GenerateArtifactModal } from "@/components/generate-artifact-modal";
describe("GenerateArtifactModal", () => {
  it("renders modal", () => {
    render(
      <GenerateArtifactModal busy={false} error={null} onClose={vi.fn()} onGenerate={vi.fn()} />
    );
    expect(screen.getByText("Generate Artifact")).toBeInTheDocument();
  });
})
