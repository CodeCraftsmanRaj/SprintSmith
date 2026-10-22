import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/prompts";

export const Route = createFileRoute("/prompts")({
  head: () => ({
    meta: [
      { title: "Prompt Library — DevPilot" },
      { name: "description", content: "Versioned and evaluated prompt templates for each SDLC artifact." },
      { property: "og:title", content: "Prompt Library — DevPilot" },
      { property: "og:description", content: "Versioned and evaluated prompt templates for each SDLC artifact." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
