import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/screens/workspace";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "SprintSmith · Project workspace" }, { name: "description", content: "Manage requirements and generate engineering deliverables in SprintSmith." }] }),
  component: Workspace,
});
