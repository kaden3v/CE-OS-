import { useEffect } from "react";

/**
 * Count of currently-active locks, so nested overlays don't unlock the page
 * when only the inner one closes.
 */
let lockCount = 0;
let restore: (() => void) | null = null;

/**
 * Freezes page scrolling behind an overlay while `active`.
 *
 * Without it, scrolling inside a modal chained through to the page underneath
 * once the modal's own scroll area hit its end — on a phone that reads as the
 * dialog dragging the whole app around behind it. Padding replaces the
 * scrollbar's width so desktop layout doesn't jump on open.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const { overflow, paddingRight } = document.body.style;
      const gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (gap > 0) document.body.style.paddingRight = `${gap}px`;
      restore = () => {
        document.body.style.overflow = overflow;
        document.body.style.paddingRight = paddingRight;
      };
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        restore?.();
        restore = null;
      }
    };
  }, [active]);
}
