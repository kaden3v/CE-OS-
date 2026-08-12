import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into `document.body` instead of in place.
 *
 * Overlays must not paint inside the page's stacking context. `<main>` is a
 * flex item, and any z-index on a flex item creates a stacking context — so a
 * drawer declaring `z-50` inside the page was still painted beneath the topbar
 * and the mobile tab bar, which are `<main>`'s siblings. Portalling to body
 * lifts the overlay out of that context so the layering scale in index.css
 * (`z-drawer`, `z-modal`, `z-toast`) actually decides what sits on top.
 *
 * React events still bubble through the React tree, not the DOM tree, so
 * handlers on ancestors keep working exactly as they did before.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
