import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GenerateArtifactModal,
  buildRequirementText,
  type ArtifactType,
} from "@/components/generate-artifact-modal";

describe("GenerateArtifactModal and buildRequirementText", () => {
  const handleClose = vi.fn();
  const handleGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildRequirementText", () => {
    it("formats prompt text for user_story with required fields and labels", () => {
      const text = buildRequirementText("user_story", {
        title: "Fast Transfer",
        actor: "Retail Customer",
        goal: "transfer money instantly",
        benefit: "reduce waiting time",
        priority: "P0 - Blocker",
        points: "5",
      });

      expect(text).toContain("[ARTIFACT]: User Story");
      expect(text).toContain("[INSTRUCTIONS]: Write a concise, actionable user story");
      expect(text).toContain("Feature / Initiative Title: Fast Transfer");
      expect(text).toContain("Actor / Role: Retail Customer");
      expect(text).toContain("Goal: transfer money instantly");
      expect(text).toContain("Business Benefit: reduce waiting time");
      expect(text).toContain("Priority: P0 - Blocker");
      expect(text).toContain("Story Points Estimate: 5");
    });

    it("formats prompt text for test_case with multi-select array field", () => {
      const text = buildRequirementText("test_case", {
        feature: "Payment Gateway",
        category: ["Unit", "Security"],
        goal: "Validate HMAC signature",
        setup: "Mock gateway token",
        count: "4",
      });

      expect(text).toContain("[ARTIFACT]: Test Case");
      expect(text).toContain("Test Category: Unit, Security");
      expect(text).toContain("Number of Test Cases: 4");
    });
  });

  describe("Modal Workflow and Wizard Steps", () => {
    it("renders Step 1 with all artifact types and disables Continue until selection", () => {
      render(
        <GenerateArtifactModal
          busy={false}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("AI WORKFLOW · STEP 1 OF 3")).toBeInTheDocument();
      expect(screen.getByText("Select an artifact type")).toBeInTheDocument();

      const continueBtn = screen.getByRole("button", { name: /continue/i });
      expect(continueBtn).toBeDisabled();

      // Verify all 6 types are present
      expect(screen.getByRole("button", { name: /user story/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /acceptance criteria/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /test case/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /sprint plan/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /architecture recommendation/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /api specification/i })).toBeInTheDocument();

      // Select User Story
      const storyCard = screen.getByRole("button", { name: /user story/i });
      fireEvent.click(storyCard);

      expect(storyCard).toHaveAttribute("aria-pressed", "true");
      expect(continueBtn).not.toBeDisabled();
    });

    it("advances to Step 2, enforces required form validation, and handles back navigation", () => {
      render(
        <GenerateArtifactModal
          busy={false}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      // Select User Story and advance
      fireEvent.click(screen.getByRole("button", { name: /user story/i }));
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));

      expect(screen.getByText("AI WORKFLOW · STEP 2 OF 3")).toBeInTheDocument();
      expect(screen.getByText("User Story details")).toBeInTheDocument();

      const previewBtn = screen.getByRole("button", { name: /preview prompt/i });
      expect(previewBtn).toBeDisabled();

      // Fill in required fields
      const titleInput = screen.getByLabelText(/Feature \/ Initiative Title/i);
      const actorInput = screen.getByLabelText(/Actor \/ Role/i);
      const goalInput = screen.getByLabelText(/^Goal/i);
      const benefitInput = screen.getByLabelText(/Business Benefit/i);
      const prioritySelect = screen.getByRole("combobox");

      fireEvent.change(titleInput, { target: { value: "OAuth Login" } });
      fireEvent.change(actorInput, { target: { value: "Customer" } });
      fireEvent.change(goalInput, { target: { value: "Sign in with Google" } });
      fireEvent.change(benefitInput, { target: { value: "One-click access" } });
      fireEvent.change(prioritySelect, { target: { value: "P1 - High" } });

      expect(previewBtn).not.toBeDisabled();

      // Number validation: Story points min 1 max 13
      const pointsInput = screen.getByLabelText(/Story Points Estimate/i);
      fireEvent.change(pointsInput, { target: { value: "25" } }); // Above max 13
      expect(previewBtn).toBeDisabled();

      fireEvent.change(pointsInput, { target: { value: "8" } }); // Valid
      expect(previewBtn).not.toBeDisabled();

      // Test "Change artifact type" back link
      const backLink = screen.getByRole("button", { name: /change artifact type/i });
      fireEvent.click(backLink);
      expect(screen.getByText("Select an artifact type")).toBeInTheDocument();
    });

    it("handles multi-select chips and range controls on test_case artifact", () => {
      render(
        <GenerateArtifactModal
          busy={false}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      // Select Test Case
      fireEvent.click(screen.getByRole("button", { name: /test case/i }));
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));

      expect(screen.getByText("Test Case details")).toBeInTheDocument();

      // Chip toggling
      const integrationChip = screen.getByRole("button", { name: "Integration" });
      const secChip = screen.getByRole("button", { name: "Security" });

      expect(integrationChip).not.toHaveClass("chosen");
      fireEvent.click(integrationChip);
      expect(integrationChip).toHaveClass("chosen");

      fireEvent.click(secChip);
      expect(secChip).toHaveClass("chosen");

      // Deselect Integration
      fireEvent.click(integrationChip);
      expect(integrationChip).not.toHaveClass("chosen");
      expect(secChip).toHaveClass("chosen");

      // Range slider
      const rangeInput = screen.getByRole("slider");
      fireEvent.change(rangeInput, { target: { value: "6" } });
      expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("progresses to Step 3, displays prompt preview, and generates artifact", () => {
      render(
        <GenerateArtifactModal
          busy={false}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      // Select User Story
      fireEvent.click(screen.getByRole("button", { name: /user story/i }));
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));

      // Fill in required fields
      fireEvent.change(screen.getByLabelText(/Feature \/ Initiative Title/i), {
        target: { value: "Fraud Detection" },
      });
      fireEvent.change(screen.getByLabelText(/Actor \/ Role/i), {
        target: { value: "Risk Analyst" },
      });
      fireEvent.change(screen.getByLabelText(/^Goal/i), {
        target: { value: "Flag suspicious high-value txns" },
      });
      fireEvent.change(screen.getByLabelText(/Business Benefit/i), {
        target: { value: "Prevent fraud losses" },
      });
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "P0 - Blocker" },
      });

      // Advance to Step 3
      fireEvent.click(screen.getByRole("button", { name: /preview prompt/i }));

      expect(screen.getByText("AI WORKFLOW · STEP 3 OF 3")).toBeInTheDocument();
      expect(screen.getByText("Review your prompt")).toBeInTheDocument();

      const previewBlock = screen.getByText(/\[ARTIFACT\]: User Story/);
      expect(previewBlock).toBeInTheDocument();
      expect(previewBlock.textContent).toContain("Fraud Detection");
      expect(previewBlock.textContent).toContain("Risk Analyst");

      // Click Generate artifact
      const generateBtn = screen.getByRole("button", { name: /generate artifact/i });
      fireEvent.click(generateBtn);

      expect(handleGenerate).toHaveBeenCalledTimes(1);
      expect(handleGenerate).toHaveBeenCalledWith(
        "user_story",
        expect.stringContaining("Fraud Detection"),
      );
    });

    it("displays error states including friendly vector retrieval timeout message", () => {
      const { rerender } = render(
        <GenerateArtifactModal
          busy={false}
          error="General server timeout"
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Artifact generation failed.")).toBeInTheDocument();
      expect(screen.getByText("General server timeout")).toBeInTheDocument();

      // Test vector retrieval timeout message
      rerender(
        <GenerateArtifactModal
          busy={false}
          error="vector retrieval timed out while scanning index"
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      expect(
        screen.getByText("Project search is taking longer than expected."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Your inputs are still here. Try Generate artifact again in a moment.",
        ),
      ).toBeInTheDocument();
    });

    it("shows loading state when busy is true", () => {
      render(
        <GenerateArtifactModal
          busy={true}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      const closeBtn = screen.getByRole("button", { name: "Close" });
      expect(closeBtn).toBeDisabled();
    });

    it("triggers onClose when clicking close button or backdrop", () => {
      const { container } = render(
        <GenerateArtifactModal
          busy={false}
          error=""
          onClose={handleClose}
          onGenerate={handleGenerate}
        />,
      );

      // Close button
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Backdrop click
      const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
      fireEvent.mouseDown(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(2);
    });
  });
});
