import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/plan";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan & Sprint Backlog — DevPilot" },
      { name: "description", content: "AI-estimated sprint backlog, capacity and velocity planning." },
      { property: "og:title", content: "Plan & Sprint Backlog — DevPilot" },
      { property: "og:description", content: "AI-estimated sprint backlog, capacity and velocity planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
