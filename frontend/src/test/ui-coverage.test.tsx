import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger, NavigationMenuContent } from "@/components/ui/navigation-menu";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ChartContainer } from "@/components/ui/chart";
import { Bar, BarChart, XAxis } from "recharts";

vi.mock("embla-carousel-react", () => {
  const api = {
    canScrollPrev: () => true,
    canScrollNext: () => true,
    on: vi.fn(),
    off: vi.fn(),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
  };
  return { default: () => [() => null, api] };
});
vi.mock("react-resizable-panels", () => ({
  Group: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  Panel: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  Separator: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

describe("uncovered UI wrappers", () => {
  it("renders command palette primitives", () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    render(<Command><CommandInput placeholder="Search commands" /><CommandList><CommandItem>Open project</CommandItem></CommandList></Command>);
    expect(screen.getByPlaceholderText("Search commands")).toBeInTheDocument();
    expect(screen.getByText("Open project")).toBeInTheDocument();
  });

  it("opens dialog, dropdown, popover, sheet, and select content", () => {
    const dialog = render(<Dialog open><DialogTrigger>Show dialog</DialogTrigger><DialogContent><DialogTitle>Dialog title</DialogTitle></DialogContent></Dialog>);
    expect(screen.getByText("Dialog title")).toBeInTheDocument();
    dialog.unmount();
    const menu = render(<DropdownMenu open><DropdownMenuTrigger>Show menu</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Menu choice</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(screen.getByText("Menu choice")).toBeInTheDocument();
    menu.unmount();
    const popover = render(<Popover open><PopoverTrigger>Show popover</PopoverTrigger><PopoverContent>Popover text</PopoverContent></Popover>);
    expect(screen.getByText("Popover text")).toBeInTheDocument();
    popover.unmount();
    const sheet = render(<Sheet open><SheetTrigger>Show sheet</SheetTrigger><SheetContent><SheetTitle>Sheet title</SheetTitle></SheetContent></Sheet>);
    expect(screen.getByText("Sheet title")).toBeInTheDocument();
    sheet.unmount();
    render(<Select open defaultValue="one"><SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem><SelectItem value="two">Two</SelectItem></SelectContent></Select>);
    expect(screen.getByRole("option", { name: "Two" })).toBeInTheDocument();
  });

  it("renders toggle, slider, scroll area, resizable panels, and toaster", () => {
    render(<>
      <ToggleGroup type="single" aria-label="Text format"><ToggleGroupItem value="bold" aria-label="Bold">B</ToggleGroupItem></ToggleGroup>
      <Slider aria-label="Volume" defaultValue={[25]} max={100} />
      <ScrollArea data-testid="scroll"><p>Scrollable content</p></ScrollArea>
      <Toaster />
    </>);
    expect(screen.getByRole("radiogroup", { name: "Text format" })).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Scrollable content")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Notifications/ })).toBeInTheDocument();
  });

  it("renders tooltip, hover card, and OTP input controls", () => {
    render(<>
      <TooltipProvider><Tooltip open><TooltipTrigger>Hover help</TooltipTrigger><TooltipContent>Helpful text</TooltipContent></Tooltip></TooltipProvider>
      <HoverCard open><HoverCardTrigger>Hover profile</HoverCardTrigger><HoverCardContent>Profile details</HoverCardContent></HoverCard>
      <InputOTP maxLength={2} aria-label="Verification code"><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /></InputOTPGroup></InputOTP>
    </>);
    expect(screen.getByText("Hover help")).toBeInTheDocument();
    expect(screen.getByText("Profile details")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Verification code" })).toBeInTheDocument();
  });

  it("opens menubar, navigation menu, context menu, and drawer", () => {
    const { unmount } = render(<>
      <Menubar defaultValue="file"><MenubarMenu value="file"><MenubarTrigger>File</MenubarTrigger><MenubarContent><MenubarItem>Save file</MenubarItem></MenubarContent></MenubarMenu></Menubar>
      <NavigationMenu value="resources"><NavigationMenuList><NavigationMenuItem value="resources"><NavigationMenuTrigger>Resources</NavigationMenuTrigger><NavigationMenuContent><NavigationMenuLink href="/docs">Docs link</NavigationMenuLink></NavigationMenuContent></NavigationMenuItem></NavigationMenuList></NavigationMenu>
    </>);
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByText("Save file")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Docs link" })).toBeInTheDocument();
    unmount();
    render(<Drawer open><DrawerTrigger>Open drawer</DrawerTrigger><DrawerContent><DrawerTitle>Drawer title</DrawerTitle></DrawerContent></Drawer>);
    expect(screen.getByText("Drawer title")).toBeInTheDocument();
  });

  it("renders sidebar navigation, chart configuration, and carousel controls", () => {
    render(<>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="none"><SidebarContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton>Projects</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarContent></Sidebar>
        <SidebarTrigger aria-label="Toggle sidebar" />
      </SidebarProvider>
      <ChartContainer config={{ count: { label: "Count", color: "#123456" } }} data-testid="chart">
        <BarChart data={[{ month: "Jan", count: 3 }]}><XAxis dataKey="month" /><Bar dataKey="count" /></BarChart>
      </ChartContainer>
    </>);
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toHaveAttribute("data-chart");
  });

  it("renders carousel controls and resizable panels", () => {
    render(<>
      <Carousel><CarouselContent><CarouselItem>Slide one</CarouselItem></CarouselContent><CarouselPrevious /><CarouselNext /></Carousel>
      <ResizablePanelGroup direction="horizontal"><ResizablePanel defaultSize={50}>Left panel</ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={50}>Right panel</ResizablePanel></ResizablePanelGroup>
    </>);
    expect(screen.getByRole("region")).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByText("Slide one")).toBeInTheDocument();
    expect(screen.getByText("Left panel")).toBeInTheDocument();
    expect(screen.getByText("Right panel")).toBeInTheDocument();
  });

  it("renders form field labels, descriptions, and context menu actions", () => {
    class TestDOMRect {
      x = 0; y = 0; width = 0; height = 0; top = 0; left = 0; right = 0; bottom = 0;
      static fromRect(rect: Partial<TestDOMRect> = {}) { return Object.assign(new TestDOMRect(), rect); }
      toJSON() { return {}; }
    }
    Object.assign(window, { DOMRect: TestDOMRect });
    function ExampleForm() {
      const methods = useForm<{ email: string }>({ defaultValues: { email: "user@example.test" } });
      return <Form {...methods}><FormField control={methods.control} name="email" render={({ field }) => (
        <FormItem><FormLabel>Email address</FormLabel><FormControl><input {...field} /></FormControl>
          <FormDescription>Used for account updates.</FormDescription><FormMessage /></FormItem>
      )} /></Form>;
    }
    render(<><ExampleForm /><ContextMenu open><ContextMenuTrigger>Target</ContextMenuTrigger>
      <ContextMenuContent><ContextMenuItem>Copy item</ContextMenuItem></ContextMenuContent></ContextMenu></>);
    expect(screen.getByLabelText("Email address")).toHaveValue("user@example.test");
    expect(screen.getByText("Used for account updates.")).toBeInTheDocument();
    expect(screen.getByText("Copy item")).toBeInTheDocument();
  });
});
