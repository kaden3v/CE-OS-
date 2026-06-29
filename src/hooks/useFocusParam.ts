import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/**
 * Opens a record's detail panel from a `?focus=<id>` deep-link (used by the
 * Activity feed's "View record"). When a row matching the id has loaded, calls
 * `open(id)` once and strips the param so it doesn't re-fire or linger in the URL.
 */
export function useFocusParam(rows: Array<{ id: string | number }>, open: (id: string) => void): void {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus");
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focus || handledRef.current === focus) return;
    if (!rows.some((r) => String(r.id) === focus)) return;
    handledRef.current = focus;
    open(focus);
    const next = new URLSearchParams(params);
    next.delete("focus");
    setParams(next, { replace: true });
  }, [focus, rows, open, params, setParams]);
}
