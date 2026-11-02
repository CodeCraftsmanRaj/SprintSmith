import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Workspace } from "@/screens/workspace";

const tokenKey = "sprintsmith_access_token";

/** Keeps workspace routes behind the client-side authentication token check. */
export function ProtectedWorkspace() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem(tokenKey) || "");
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (!token && pathname !== "/login") {
      void navigate({ to: "/login", replace: true });
    } else if (token && pathname === "/login") {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, pathname, token]);

  if (token === null || (!token && pathname !== "/login") || (token && pathname === "/login")) {
    return <div className="min-h-screen" role="status" aria-label="Checking authentication" />;
  }

  return <Workspace onTokenChange={setToken} />;
}
