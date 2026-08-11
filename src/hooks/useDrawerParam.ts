import { useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";

const DEFAULT_KEY = "view";

/**
 * Detail-drawer open state, held in the URL as `?view=<id>`.
 *
 * Drawers used to be plain `useState`, which meant Android's back button left
 * the page entirely instead of closing the open panel, and an open record
 * couldn't be linked to. Putting the id in the URL fixes both: back pops the
 * entry that opened the drawer, and the state is shareable.
 *
 * Opening pushes a history entry; closing from the UI pops it, so the two
 * cancel out and the user isn't left with a trail of entries. If the drawer was
 * opened by a deep link (the id was already in the URL on arrival) there is no
 * entry of ours to pop, so closing strips the param in place instead — going
 * "back" from a deep link should leave the app, not re-open the drawer.
 *
 * Deliberately built on react-router's navigate/setSearchParams rather than raw
 * `history.pushState`: the latter doesn't update the router's own location, and
 * an unmount-time `history.back()` would undo a real navigation — the Orders
 * drawer contains links to other pages, so that would bounce the user back.
 */
export function useDrawerParam(
  key: string = DEFAULT_KEY,
): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pushedRef = useRef(false);

  const selectedId = params.get(key);

  const setSelectedId = useCallback(
    (id: string | null) => {
      if (id === null) {
        if (pushedRef.current) {
          pushedRef.current = false;
          navigate(-1);
          return;
        }
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete(key);
            return next;
          },
          { replace: true },
        );
        return;
      }
      pushedRef.current = true;
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, id);
        return next;
      });
    },
    [key, navigate, setParams],
  );

  return [selectedId, setSelectedId];
}
