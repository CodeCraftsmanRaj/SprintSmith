import { createFileRoute } from "@tanstack/react-router";
import { ProtectedWorkspace } from "@/components/ProtectedWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "SprintSmith · Project workspace" }, { name: "description", content: "Manage requirements and generate engineering deliverables in SprintSmith." }] }),
  component: ProtectedWorkspace,
});
