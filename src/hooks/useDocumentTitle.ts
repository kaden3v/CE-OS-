import { useEffect } from "react";
import { useLocation } from "react-router";

const APP_NAME = "CEOS";

/** Path segments whose title-cased form isn't what we want to show. */
const SEGMENT_LABELS: Record<string, string> = {
  "": "Dashboard",
  "qr-codes": "QR Codes",
  "print-queue": "Print Queue",
  "access-requests": "Access Requests",
  "tax-report": "Tax Report",
  admin: "Admin",
};

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "/finances/vendors" → "Finances · Vendors · CEOS" */
export function titleForPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return `Dashboard · ${APP_NAME}`;
  const labels = segments.map((s) => SEGMENT_LABELS[s] ?? titleCase(s));
  return `${labels.join(" · ")} · ${APP_NAME}`;
}

/**
 * Keeps the tab title in step with the route.
 *
 * Every one of the 34 routes previously rendered as "CEOS — Canyon Exotics", so
 * browser history and tab switching gave the user nothing to navigate by.
 */
export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
}
