import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/audit";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Logs — DevPilot" },
      { name: "description", content: "Immutable audit trail of user, agent and system actions." },
      { property: "og:title", content: "Audit Logs — DevPilot" },
      { property: "og:description", content: "Immutable audit trail of user, agent and system actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
