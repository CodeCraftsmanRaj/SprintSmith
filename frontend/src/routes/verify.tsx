import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/verify";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify & Matrix — DevPilot" },
      { name: "description", content: "Verify requirements coverage with the traceability matrix." },
      { property: "og:title", content: "Verify & Matrix — DevPilot" },
      { property: "og:description", content: "Verify requirements coverage with the traceability matrix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
