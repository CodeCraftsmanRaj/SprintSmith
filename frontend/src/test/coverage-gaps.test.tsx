import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { renderErrorPage } from "@/lib/error-page";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";
import { describeError } from "@/lib/error-capture";

describe("coverage for lightweight UI wrappers", () => {
  it("renders an aspect ratio container", () => {
    render(<AspectRatio ratio={16 / 9} data-testid="ratio"><img alt="preview" /></AspectRatio>);
    expect(screen.getByTestId("ratio")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "preview" })).toBeInTheDocument();
  });

  it("renders breadcrumb links, current page, custom separator, and ellipsis", () => {
    render(<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink>
      <BreadcrumbSeparator>›</BreadcrumbSeparator><BreadcrumbPage>Current</BreadcrumbPage>
      <BreadcrumbEllipsis /></BreadcrumbItem></BreadcrumbList></Breadcrumb>);
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("›")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
  });

  it("opens and cancels an alert dialog", () => {
    render(<AlertDialog><AlertDialogTrigger>Delete item</AlertDialogTrigger><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Confirm deletion</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Delete</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>);
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("This cannot be undone.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders a calendar month and day buttons", () => {
    render(<Calendar defaultMonth={new Date(2025, 0, 1)} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: /Wednesday, January 15th, 2025/i })).toBeInTheDocument();
  });
});

describe("coverage for server utilities", () => {
  it("renders a self-contained error page", () => {
    const html = renderErrorPage();
    expect(html).toContain("This page didn't load");
    expect(html).toContain('href="/"');
    expect(html).toContain("location.reload()");
  });

  it("authenticates the current and previous cron secret and rejects invalid requests", async () => {
    vi.stubEnv("LOVABLE_CRON_SECRET", "current-secret");
    vi.stubEnv("LOVABLE_CRON_SECRET_PREVIOUS", "old-secret");
    expect((await authenticateCronRequest(new Request("https://x.test", { headers: { authorization: "Bearer current-secret" } })))).toBeNull();
    expect(await authenticateCronRequest(new Request("https://x.test", { headers: { authorization: "Bearer old-secret" } }))).toBeNull();
    expect((await authenticateCronRequest(new Request("https://x.test")))?.status).toBe(401);
    expect((await authenticateCronRequest(new Request("https://x.test", { headers: { authorization: "Bearer wrong" } })))?.status).toBe(401);
    vi.unstubAllEnvs();
    expect((await authenticateCronRequest(new Request("https://x.test")))?.status).toBe(500);
  });

  it("uses local storage outside a preview frame", async () => {
    localStorage.setItem("session", "local-session");
    const storage = brokeredPreviewStorage();
    expect(storage).toBeDefined();
    expect(await storage!.getItem("session")).toBe("local-session");
    await storage!.setItem("other", "value");
    expect(localStorage.getItem("other")).toBe("value");
    await storage!.removeItem("other");
    expect(localStorage.getItem("other")).toBeNull();
  });

  it("describes errors with causes and status codes", () => {
    const root = new Error("root cause");
    const outer = new Error("request failed", { cause: root }) as Error & { statusCode: number };
    outer.statusCode = 502;
    expect(describeError(outer)).toContain("request failed");
    expect(describeError(outer)).toContain("status 502");
    expect(describeError(outer)).toContain("caused by:");
    expect(describeError({ reason: "bad" })).toContain('"reason":"bad"');
  });
});

