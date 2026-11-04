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
      <Screen html={html} bodyClass="bg-dark-workspace antialiased" />,
    );

    expect(screen.getByRole("heading", { name: "Docling Pipeline" })).toBeInTheDocument();
    expect(screen.getByText("Ingestion view")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-dark-workspace");
  });

  it("mounts children inside the live-slot portal within main element", () => {
    const html = `<main><section><p>Main body</p></section></main>`;
    render(
      <Screen html={html} bodyClass="">
        <div data-testid="injected-child">Portal Child Content</div>
      </Screen>,
    );

    const child = screen.getByTestId("injected-child");
    expect(child).toBeInTheDocument();
    expect(child.parentElement).toHaveAttribute("data-live-slot");
  });

  it("uses the main element or screen container when no first child is available", () => {
    const { rerender } = render(
      <Screen html="<main></main>" bodyClass="">
        <span data-testid="main-fallback">Main fallback</span>
      </Screen>,
    );
    expect(screen.getByTestId("main-fallback").parentElement?.parentElement?.tagName).toBe("MAIN");

    rerender(
      <Screen html="<div></div>" bodyClass="">
        <span data-testid="container-fallback">Container fallback</span>
      </Screen>,
    );
    expect(screen.getByTestId("container-fallback").parentElement).toHaveAttribute("data-live-slot");
  });

  it("navigates when clicking an anchor with known data-path", () => {
    const html = `
      <div>
        <a id="link-synthesize" data-path="02-synthesize" href="#">Synthesize</a>
        <a id="link-overview" data-path="overview" href="#">Overview</a>
        <a id="link-plan" data-path="04-plan" href="#">Plan</a>
        <a id="link-ingest" data-path="01-ingest" href="#">Ingest</a>
        <a id="link-verify" data-path="03-verify" href="#">Verify</a>
        <a id="link-prompts" data-path="prompt-library" href="#">Prompts</a>
        <a id="link-audit" data-path="audit-logs" href="#">Audit</a>
        <a id="link-login" data-path="login" href="#">Login</a>
        <a id="link-unknown" data-path="unknown-page" href="#">Unknown</a>
        <a id="link-external" href="/external">External</a>
        <span id="non-link">Not a link</span>
      </div>
    `;

    render(<Screen html={html} bodyClass="" />);

    const synthesizeLink = screen.getByText("Synthesize");
    fireEvent.click(synthesizeLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/synthesize" });

    const overviewLink = screen.getByText("Overview");
    fireEvent.click(overviewLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/overview" });

    const planLink = screen.getByText("Plan");
    fireEvent.click(planLink);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/plan" });

    for (const [label, path] of [
      ["Ingest", "/"],
      ["Verify", "/verify"],
      ["Prompts", "/prompts"],
      ["Audit", "/audit"],
      ["Login", "/login"],
    ]) {
      fireEvent.click(screen.getByText(label));
      expect(mockNavigate).toHaveBeenLastCalledWith({ to: path });
    }

    mockNavigate.mockClear();
    const unknownLink = screen.getByText("Unknown");
    screen.getByText("External").addEventListener(
      "click",
      (event) => event.preventDefault(),
      { once: true },
    );
    fireEvent.click(unknownLink);
    fireEvent.click(screen.getByText("External"));
    fireEvent.click(screen.getByText("Not a link"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
