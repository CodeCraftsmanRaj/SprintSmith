import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as audit from "@/screens/audit";
import * as ingest from "@/screens/ingest";
import * as login from "@/screens/login";
import * as overview from "@/screens/overview";
import * as plan from "@/screens/plan";
import * as prompts from "@/screens/prompts";
import * as synthesize from "@/screens/synthesize";
import * as verify from "@/screens/verify";
import { buildTree } from "@/lib/parse-doc";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/backend-api";
import { getRouter } from "@/router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

describe("static screens and document parsing", () => {
  it.each([
    ["audit", audit, "Audit Log"], ["ingest", ingest, "Docling"], ["login", login, "Sign in"],
    ["overview", overview, "Overview"], ["plan", plan, "Sprint Backlog"],
    ["prompts", prompts, "Prompt"], ["synthesize", synthesize, "Synthesize"], ["verify", verify, "Verification"],
  ])("renders static %s screen content", (_name, screenModule, heading) => {
    expect(screenModule.html).toContain(heading);
    expect(screenModule.bodyClass).toContain("bg-surface");
    expect(screenModule.script).toBeTypeOf("string");
  });

  it("builds nested markdown and numbered sections, paragraph and table nodes", () => {
    expect(buildTree("# Payments\n\n## Settlement\nDetails here\n\n1.2 RECONCILIATION\n\nA | B\n--- | ---")).toEqual([
      { type: "section", label: "Payments", children: [
        { type: "section", label: "Settlement", children: [{ type: "paragraph", label: "Details here" }] },
        { type: "section", label: "RECONCILIATION", children: [{ type: "table", label: "A | B --- | ---" }] },
      ] },
    ]);
    expect(buildTree("\n\n" )).toEqual([]);
  });
});

describe("backend API client", () => {
  it("sends auth and JSON headers and parses successful responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await expect(api("/health", "token", { method: "POST", body: "{}" })).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("Content-Type")).toBe("application/json");
    fetchMock.mockRestore();
  });

  it("returns undefined for 204 and surfaces API, malformed, and network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api("/empty")).resolves.toBeUndefined();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Denied" }), { status: 403 }));
    await expect(api("/forbidden")).rejects.toThrow("Denied");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("not json", { status: 500 }));
    await expect(api("/broken")).rejects.toThrow("Request failed (500)");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(api("/offline")).rejects.toThrow("Cannot reach the API");
    vi.restoreAllMocks();
  });
});

it("creates the application router with its registered route tree", () => {
  const router = getRouter();
  expect(router).toBeDefined();
  expect(router.options.scrollRestoration).toBe(true);
});

describe("under-covered UI primitives", () => {
  it("renders pagination links, progress, and editable inputs", () => {
    render(<>
      <Pagination><PaginationContent><PaginationItem><PaginationPrevious href="/?page=1" /></PaginationItem><PaginationItem><PaginationLink href="/?page=2" isActive>2</PaginationLink></PaginationItem><PaginationItem><PaginationEllipsis /></PaginationItem><PaginationItem><PaginationNext href="/?page=3" /></PaginationItem></PaginationContent></Pagination>
      <Progress value={45} aria-label="Upload progress" />
      <Textarea aria-label="Notes" />
      <Switch aria-label="Notifications" />
      <RadioGroup aria-label="Priority" defaultValue="p1"><RadioGroupItem value="p1" aria-label="High" /><RadioGroupItem value="p2" aria-label="Low" /></RadioGroup>
      <Table><TableHeader><TableRow><TableHead>Story</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Payments</TableCell></TableRow></TableBody></Table>
      <Tabs defaultValue="details"><TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList><TabsContent value="details">Current details</TabsContent><TabsContent value="history">Past changes</TabsContent></Tabs>
    </>);
    expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Notifications" }));
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });

  it("renders common form, status, card, accordion, and collapsible primitives", () => {
    render(<>
      <Alert><AlertTitle>Notice</AlertTitle><AlertDescription>Saved locally</AlertDescription></Alert>
      <Avatar><AvatarFallback>SS</AvatarFallback></Avatar>
      <Badge>Ready</Badge>
      <Card><CardHeader><CardTitle>Project</CardTitle><CardDescription>Details</CardDescription></CardHeader><CardContent>Payment migration</CardContent></Card>
      <Checkbox aria-label="Select project" />
      <Accordion type="single" defaultValue="one" collapsible><AccordionItem value="one"><AccordionTrigger>Section</AccordionTrigger><AccordionContent>Section content</AccordionContent></AccordionItem></Accordion>
      <Collapsible defaultOpen><CollapsibleTrigger>More options</CollapsibleTrigger><CollapsibleContent>Extra settings</CollapsibleContent></Collapsible>
    </>);
    expect(screen.getByText("Saved locally")).toBeInTheDocument();
    expect(screen.getByText("SS")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Payment migration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select project" }));
    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
  });

  it("mounts screen children into the live slot and handles known, unknown, and hash links", async () => {
    const view = render(<Screen html='<main><section><a data-path="overview" href="#">Overview</a><a data-path="unknown" href="#">Unknown</a><a href="https://example.test">External</a></section></main>' bodyClass="theme"><p>Live content</p></Screen>);
    expect(screen.getByText("Live content")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Overview"));
    fireEvent.click(screen.getByText("Unknown"));
    fireEvent.click(screen.getByText("External"));
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledWith({ to: "/overview" });
    expect(view.container.querySelector("[data-live-slot]")).toBeInTheDocument();
    view.unmount();
  });
});
