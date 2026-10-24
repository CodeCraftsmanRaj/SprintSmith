import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/screens/workspace";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "DevPilot · Project workspace" }, { name: "description", content: "Manage requirements and generate engineering deliverables in DevPilot." }] }),
  component: Workspace,
});
