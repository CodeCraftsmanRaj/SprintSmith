import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/overview";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — DevPilot" },
      { name: "description", content: "DevPilot SDLC platform overview and pipeline health." },
      { property: "og:title", content: "Overview — DevPilot" },
      { property: "og:description", content: "DevPilot SDLC platform overview and pipeline health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
