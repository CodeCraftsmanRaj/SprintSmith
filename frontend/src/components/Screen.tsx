import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";

const PATHS: Record<string, string> = {
  "01-ingest": "/",
  "02-synthesize": "/synthesize",
  "03-verify": "/verify",
  overview: "/overview",
  "04-plan": "/plan",
  "prompt-library": "/prompts",
  "audit-logs": "/audit",
  login: "/login",
};

/** Renders a static design screen; optional children are mounted at the top of the page's main area. */
export function Screen({
  html,
  script,
  bodyClass,
  children,
}: {
  html: string;
  script: string;
  bodyClass: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (script) {
      try {
        new Function(script)();
      } catch (e) {
        console.error(e);
      }
    }
    if (children !== undefined) {
      const main = el.querySelector("main");
      const host = (main?.firstElementChild as HTMLElement | null) ?? main ?? el;
      const div = document.createElement("div");
      div.setAttribute("data-live-slot", "");
      host.prepend(div);
      setSlot(div);
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const p = a.getAttribute("data-path");
      if (a.getAttribute("href") === "#") e.preventDefault();
      if (p && PATHS[p]) navigate({ to: PATHS[p] as "/" });
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, script, navigate]);

  return (
    <>
      <div ref={ref} className={`min-h-screen ${bodyClass}`} dangerouslySetInnerHTML={{ __html: html }} />
      {slot && children ? createPortal(children, slot) : null}
    </>
  );
}
