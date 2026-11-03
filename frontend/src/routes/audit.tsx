import { createFileRoute } from "@tanstack/react-router";
import { ProtectedWorkspace } from "@/components/ProtectedWorkspace";

export const Route = createFileRoute("/audit")({ component: ProtectedWorkspace });
