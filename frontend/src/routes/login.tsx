import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "@/components/Screen";
import * as s from "@/screens/login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — DevPilot" },
      { name: "description", content: "Sign in or register for the DevPilot SDLC co-pilot." },
      { property: "og:title", content: "Sign in — DevPilot" },
      { property: "og:description", content: "Sign in or register for the DevPilot SDLC co-pilot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Screen html={s.html} script={s.script} bodyClass={s.bodyClass} />,
});
