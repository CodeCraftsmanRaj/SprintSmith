import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/screens/workspace";

export const Route = createFileRoute("/overview")({ component: Workspace });
