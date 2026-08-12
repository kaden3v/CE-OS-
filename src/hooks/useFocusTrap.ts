import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  // Deliberately not filtering on offsetWidth/offsetHeight: everything inside a
  // dialog that just opened is visible by construction, and those properties
  // are always 0 under jsdom, which would make the trap untestable.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Keeps Tab focus inside `containerRef` while `active`, and restores focus to
 * whatever was focused before on close.
 *
 * Without this, tabbing out of an open dialog walked into the page behind it —
 * a keyboard or screen-reader user could be editing a form they can no longer
 * see (WCAG 2.4.3). On close, focus was dropped to <body>, losing the user's
 * place entirely.
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      // Don't steal focus from a field that autoFocus already claimed.
      const alreadyInside = container.contains(document.activeElement);
      if (!alreadyInside) (focusableWithin(container)[0] ?? container).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const items = focusableWithin(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [active, containerRef]);
}
