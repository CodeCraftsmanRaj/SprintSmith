import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Screen } from "@/components/Screen";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

describe("Screen component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders html and applies bodyClass", () => {
    const html = `<main><h1>Docling Pipeline</h1><p>Ingestion view</p></main>`;
    const { container } = render(
      <Screen html={html} script="" bodyClass="bg-dark-workspace antialiased" />,
    );

    expect(screen.getByRole("heading", { name: "Docling Pipeline" })).toBeInTheDocument();
    expect(screen.getByText("Ingestion view")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-dark-workspace");
  });

  it("executes script and catches script errors safely", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const script = `window.__test_script_executed = true; throw new Error('Script failure');`;

    render(<Screen html="<div>Content</div>" script={script} bodyClass="" />);

    expect((window as unknown as { __test_script_executed: boolean }).__test_script_executed).toBe(
      true,
    );
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("mounts children inside the live-slot portal within main element", () => {
    const html = `<main><section><p>Main body</p></section></main>`;
    render(
      <Screen html={html} script="" bodyClass="">
        <div data-testid="injected-child">Portal Child Content</div>
      </Screen>,
    );

    const child = screen.getByTestId("injected-child");
    expect(child).toBeInTheDocument();
    expect(child.parentElement).toHaveAttribute("data-live-slot");
  });

  it("navigates when clicking an anchor with known data-path", () => {
    const html = `
      <div>
        <a id="link-synthesize" data-path="02-synthesize" href="#">Synthesize</a>
        <a id="link-overview" data-path="overview" href="#">Overview</a>
        <a id="link-plan" data-path="04-plan" href="#">Plan</a>
        <a id="link-unknown" data-path="unknown-page" href="#">Unknown</a>
      </div>
    `;

    render(<Screen html={html} script="" bodyClass="" />);

    const synthesizeLink = screen.getByText("Synthesize");
    fireEvent.click(synthesizeLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/synthesize" });

    const overviewLink = screen.getByText("Overview");
    fireEvent.click(overviewLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/overview" });

    const planLink = screen.getByText("Plan");
    fireEvent.click(planLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/plan" });

    mockNavigate.mockClear();
    const unknownLink = screen.getByText("Unknown");
    // Keep jsdom from attempting a real document navigation for the unhandled link.
    unknownLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(unknownLink);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
