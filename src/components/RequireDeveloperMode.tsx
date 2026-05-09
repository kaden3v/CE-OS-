import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useApp } from "@/contexts/AppContext";

export function RequireDeveloperMode({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const devQs =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dev") === "1";

  if (!settings.developerMode && !devQs) {
    return <Navigate to="/settings" replace />;
  }

  return children;
}
