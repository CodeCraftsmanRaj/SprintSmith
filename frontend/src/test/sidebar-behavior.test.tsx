import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset,
  SidebarMenu, SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarRail, SidebarSeparator, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

afterEach(() => vi.unstubAllGlobals());

describe("sidebar interactions and variants", () => {
  it("renders navigation primitives and updates state by buttons, rail, and shortcut", () => {
    render(<SidebarProvider defaultOpen={false}>
      <Sidebar side="right" variant="floating" collapsible="icon">
        <SidebarHeader>Workspace header</SidebarHeader>
        <SidebarInput aria-label="Filter projects" />
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel asChild><a href="/projects">Projects group</a></SidebarGroupLabel>
            <SidebarGroupAction asChild aria-label="Add project"><a href="/projects/new">+</a></SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu><SidebarMenuItem>
                <SidebarMenuButton asChild isActive variant="outline" size="sm" tooltip="Open projects"><a href="/projects">Projects</a></SidebarMenuButton>
                <SidebarMenuAction showOnHover aria-label="Project actions">Actions</SidebarMenuAction>
                <SidebarMenuBadge>3</SidebarMenuBadge>
                <SidebarMenuSkeleton showIcon data-testid="menu-skeleton" />
                <SidebarMenuSub><SidebarMenuSubItem><SidebarMenuSubButton href="/projects/one" size="sm" isActive>One</SidebarMenuSubButton></SidebarMenuSubItem></SidebarMenuSub>
              </SidebarMenuItem></SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Workspace footer</SidebarFooter>
      </Sidebar>
      <SidebarRail />
      <SidebarTrigger />
      <SidebarInset>Project page</SidebarInset>
    </SidebarProvider>);

    const sidebar = document.querySelector(".peer[data-state]")!;
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "One" })).toHaveAttribute("data-size", "sm");
    expect(screen.getByTestId("menu-skeleton").querySelector("[data-sidebar='menu-skeleton-icon']")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    const toggles = screen.getAllByRole("button", { name: "Toggle Sidebar" });
    fireEvent.click(toggles[0]);
    expect(document.querySelector(".peer[data-state]")).toHaveAttribute("data-state", "expanded");
    expect(document.cookie).toContain("sidebar_state=true");
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(document.querySelector(".peer[data-state]")).toHaveAttribute("data-state", "collapsed");
    fireEvent.click(toggles[1]);
    expect(document.querySelector(".peer[data-state]")).toHaveAttribute("data-state", "expanded");
  });

  it("supports a controlled desktop sidebar and the non-collapsible layout", () => {
    const onOpenChange = vi.fn();
    render(<SidebarProvider open onOpenChange={onOpenChange}>
      <Sidebar collapsible="none" className="fixed-sidebar"><SidebarContent>Always visible</SidebarContent></Sidebar>
      <SidebarTrigger />
    </SidebarProvider>);
    expect(screen.getByText("Always visible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens a mobile sidebar in a sheet when the viewport matches the mobile query", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query.includes("max-width"), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    render(<SidebarProvider><Sidebar side="right"><SidebarContent>Mobile projects</SidebarContent></Sidebar><SidebarTrigger /></SidebarProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(await screen.findByText("Mobile projects")).toBeInTheDocument();
    expect(document.querySelector("[data-mobile='true']")).toBeInTheDocument();
  });

  it("explains that sidebar context helpers require the provider", () => {
    function OutsideProvider() { useSidebar(); return null; }
    expect(() => render(<OutsideProvider />)).toThrow("useSidebar must be used within a SidebarProvider.");
  });
});
