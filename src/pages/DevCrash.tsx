import { Navigate } from "react-router";

/** Dev-only route to verify ErrorBoundary. In production, redirects home. */
export default function DevCrash() {
  if (import.meta.env.DEV) {
    throw new Error("Dev crash test — ErrorBoundary");
  }
  return <Navigate to="/" replace />;
}
