import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

describe("UI primitives", () => {
  describe("cn utility", () => {
    it("merges conditional classnames and removes conflicting tailwind classes", () => {
      const result = cn("px-2 py-1", false && "hidden", true && "px-4", "text-red-500");
      expect(result).toContain("px-4");
      expect(result).not.toContain("px-2");
      expect(result).toContain("text-red-500");
    });
  });

  describe("Button component", () => {
    it("renders with default props and handles click events", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click Me</Button>);

      const btn = screen.getByRole("button", { name: "Click Me" });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("renders variants correctly", () => {
      const { rerender } = render(<Button variant="destructive">Delete</Button>);
      expect(screen.getByRole("button")).toHaveClass("bg-destructive");

      rerender(<Button variant="outline">Outline</Button>);
      expect(screen.getByRole("button")).toHaveClass("border-input");

      rerender(<Button variant="ghost">Ghost</Button>);
      expect(screen.getByRole("button")).toHaveClass("hover:bg-accent");

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole("button")).toHaveClass("bg-secondary");
    });

    it("renders different sizes", () => {
      const { rerender } = render(<Button size="sm">Small</Button>);
      expect(screen.getByRole("button")).toHaveClass("h-8");

      rerender(<Button size="lg">Large</Button>);
      expect(screen.getByRole("button")).toHaveClass("h-10");

      rerender(<Button size="icon">Icon</Button>);
      expect(screen.getByRole("button")).toHaveClass("w-9");
    });

    it("disables button when disabled prop is provided", () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>,
      );

      const btn = screen.getByRole("button", { name: "Disabled" });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("renders custom element with asChild", () => {
      render(
        <Button asChild>
          <a href="/target">Link Button</a>
        </Button>,
      );

      const link = screen.getByRole("link", { name: "Link Button" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/target");
      expect(link).toHaveClass("inline-flex");
    });
  });

  describe("Input component", () => {
    it("renders input field and accepts user text changes", () => {
      const handleChange = vi.fn();
      render(
        <Input placeholder="Enter username" onChange={handleChange} />,
      );

      const input = screen.getByPlaceholderText("Enter username");
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "developer1" } });
      expect(handleChange).toHaveBeenCalled();
      expect((input as HTMLInputElement).value).toBe("developer1");
    });

    it("supports disabled state", () => {
      render(<Input placeholder="Disabled input" disabled />);
      expect(screen.getByPlaceholderText("Disabled input")).toBeDisabled();
    });

    it("applies custom className", () => {
      render(<Input placeholder="Styled" className="custom-test-class" />);
      expect(screen.getByPlaceholderText("Styled")).toHaveClass("custom-test-class");
    });
  });

  describe("Badge component", () => {
    it("renders badge with text and default variant", () => {
      render(<Badge>Active</Badge>);
      const badge = screen.getByText("Active");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("bg-primary");
    });

    it("renders secondary, destructive and outline variants", () => {
      const { rerender } = render(<Badge variant="secondary">In Progress</Badge>);
      expect(screen.getByText("In Progress")).toHaveClass("bg-secondary");

      rerender(<Badge variant="destructive">Failed</Badge>);
      expect(screen.getByText("Failed")).toHaveClass("bg-destructive");

      rerender(<Badge variant="outline">Draft</Badge>);
      expect(screen.getByText("Draft")).toHaveClass("text-foreground");
    });
  });
});
