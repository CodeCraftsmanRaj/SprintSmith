import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/synthesize";

export const Route = createFileRoute("/synthesize")({
  head: () => ({
    meta: [
      { title: "Synthesize & SOP Graph — DevPilot" },
      { name: "description", content: "Synthesize user stories, Gherkin and OpenAPI artifacts from SOPs." },
      { property: "og:title", content: "Synthesize & SOP Graph — DevPilot" },
      { property: "og:description", content: "Synthesize user stories, Gherkin and OpenAPI artifacts from SOPs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
