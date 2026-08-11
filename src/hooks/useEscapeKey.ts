import { useEffect, useRef } from "react";

/**
 * Stack of currently-active Escape handlers, innermost last.
 *
 * Overlays nest — a modal opens on top of a drawer, and both listen for
 * Escape. Without a stack both would fire and one keypress would close two
 * layers. Only the top entry is invoked, so Escape peels one layer at a time.
 */
const handlerStack: Array<() => void> = [];
let listenerBound = false;

function onWindowKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  const top = handlerStack[handlerStack.length - 1];
  if (top) top();
}

/**
 * Calls `onEscape` when Escape is pressed, while `active` is true and this is
 * the innermost active overlay.
 *
 * The handler is held in a ref so callers can pass an inline arrow without
 * re-binding on every render.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const entry = () => handler.current();
    handlerStack.push(entry);
    if (!listenerBound) {
      window.addEventListener("keydown", onWindowKeyDown);
      listenerBound = true;
    }
    return () => {
      const i = handlerStack.indexOf(entry);
      if (i !== -1) handlerStack.splice(i, 1);
    };
  }, [active]);
}
