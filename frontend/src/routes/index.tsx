import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/ingest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ingest & Docling Tree — DevPilot" },
      { name: "description", content: "Ingest requirement documents and explore the parsed Docling tree." },
      { property: "og:title", content: "Ingest & Docling Tree — DevPilot" },
      { property: "og:description", content: "Ingest requirement documents and explore the parsed Docling tree." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
