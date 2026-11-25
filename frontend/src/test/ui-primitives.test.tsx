import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
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

  describe("content primitives", () => {
    it("renders card sections and alert content", () => {
      render(
        <>
          <Card data-testid="card">
            <CardHeader>
              <CardTitle>Project details</CardTitle>
              <CardDescription>Project summary</CardDescription>
            </CardHeader>
            <CardContent>Project content</CardContent>
            <CardFooter>Project actions</CardFooter>
          </Card>
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>Please try again.</AlertDescription>
          </Alert>
        </>,
      );

      expect(screen.getByTestId("card")).toHaveClass("rounded-xl");
      expect(screen.getByText("Project details")).toBeInTheDocument();
      expect(screen.getByText("Project summary")).toBeInTheDocument();
      expect(screen.getByText("Project content")).toBeInTheDocument();
      expect(screen.getByText("Project actions")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveClass("text-destructive");
      expect(screen.getByText("Please try again.")).toBeInTheDocument();
    });

    it("renders progress, separator, skeleton, textarea, and associated label", () => {
      render(
        <>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" placeholder="Add notes" />
          <Progress aria-label="Upload progress" value={40} />
          <Separator data-testid="separator" orientation="vertical" decorative={false} />
          <Skeleton data-testid="skeleton" />
        </>,
      );

      expect(screen.getByLabelText("Notes")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Upload progress" })).toBeInTheDocument();
      expect(screen.getByTestId("separator")).toHaveAttribute("data-orientation", "vertical");
      expect(screen.getByTestId("skeleton")).toHaveClass("animate-pulse");
    });

    it("renders the table structure and content", () => {
      render(
        <Table>
          <TableCaption>Recent projects</TableCaption>
          <TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>
          <TableBody><TableRow><TableCell>Payments</TableCell></TableRow></TableBody>
          <TableFooter><TableRow><TableCell>1 project</TableCell></TableRow></TableFooter>
        </Table>,
      );

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("Recent projects")).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Payments" })).toBeInTheDocument();
      expect(screen.getByText("1 project")).toBeInTheDocument();
    });
  });

  describe("interactive primitives", () => {
    it("supports checkbox, radio, switch, and toggle interactions", () => {
      render(
        <>
          <Checkbox aria-label="Select project" />
          <RadioGroup defaultValue="editor" aria-label="Project role">
            <RadioGroupItem value="viewer" aria-label="Viewer" />
            <RadioGroupItem value="editor" aria-label="Editor" />
          </RadioGroup>
          <Switch aria-label="Enable alerts" />
          <Toggle aria-label="Pin project" variant="outline" size="sm">Pin</Toggle>
        </>,
      );

      const checkbox = screen.getByRole("checkbox", { name: "Select project" });
      fireEvent.click(checkbox);
      expect(checkbox).toHaveAttribute("data-state", "checked");
      expect(screen.getByRole("radio", { name: "Editor" })).toHaveAttribute("data-state", "checked");

      const toggle = screen.getByRole("button", { name: "Pin project" });
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("data-state", "on");

      const toggleSwitch = screen.getByRole("switch", { name: "Enable alerts" });
      fireEvent.click(toggleSwitch);
      expect(toggleSwitch).toHaveAttribute("data-state", "checked");
    });

    it("switches tabs and expands accordion and collapsible content", () => {
      render(
        <>
          <Tabs defaultValue="overview">
            <TabsList><TabsTrigger value="overview">Overview tab</TabsTrigger><TabsTrigger value="activity">Activity tab</TabsTrigger></TabsList>
            <TabsContent value="overview">Overview panel</TabsContent>
            <TabsContent value="activity">Activity panel</TabsContent>
          </Tabs>
          <Accordion type="single" collapsible>
            <AccordionItem value="details">
              <AccordionTrigger>Show details</AccordionTrigger>
              <AccordionContent>Details content</AccordionContent>
            </AccordionItem>
          </Accordion>
          <Collapsible>
            <CollapsibleTrigger>Show more</CollapsibleTrigger>
            <CollapsibleContent>More content</CollapsibleContent>
          </Collapsible>
        </>,
      );

      fireEvent.mouseDown(screen.getByRole("tab", { name: "Activity tab" }), { button: 0 });
      expect(screen.getByText("Activity panel")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show details" }));
      expect(screen.getByText("Details content")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show more" }));
      expect(screen.getByText("More content")).toBeInTheDocument();
    });

    it("renders avatar fallback and pagination controls", () => {
      render(
        <>
          <Avatar>
            <AvatarImage src="/missing-avatar.png" alt="Project owner" />
            <AvatarFallback>PO</AvatarFallback>
          </Avatar>
          <Pagination>
            <PaginationContent>
              <PaginationItem><PaginationPrevious href="?page=1" /></PaginationItem>
              <PaginationItem><PaginationLink href="?page=2" isActive>2</PaginationLink></PaginationItem>
              <PaginationItem><PaginationEllipsis /></PaginationItem>
              <PaginationItem><PaginationNext href="?page=3" /></PaginationItem>
            </PaginationContent>
          </Pagination>
        </>,
      );

      expect(screen.getByText("PO")).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to previous page" })).toHaveAttribute("href", "?page=1");
      expect(screen.getByRole("link", { name: "2" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Go to next page" })).toHaveAttribute("href", "?page=3");
      expect(screen.getByText("More pages")).toBeInTheDocument();
    });
  });
});
