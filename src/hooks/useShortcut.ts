/**
 * Global keyboard shortcut hook.
 *
 * Supports two kinds:
 *   - combo:    { keys: ["meta", "k"] }       — modifier + key, fires on keydown
 *   - sequence: { keys: ["g", "i"], sequence: true }  — two-keystroke ("g i"),
 *               second key must arrive within 1s of the first
 *
 * Skips when focus is in an editable element (input, textarea, contenteditable).
 * An explicit `allowInEditable: true` overrides — used for ⌘K, esc.
 */

import { useEffect, useRef } from 'react';

export type ShortcutDef = {
  keys: string[];
  sequence?: boolean;
  allowInEditable?: boolean;
  handler: (e: KeyboardEvent) => void;
};

const SEQUENCE_TIMEOUT_MS = 1000;

export function useShortcut(def: ShortcutDef | null, deps: unknown[] = []) {
  const seqState = useRef<{ buf: string[]; ts: number }>({ buf: [], ts: 0 });

  useEffect(() => {
    if (!def) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (inEditable && !def.allowInEditable) return;

      if (def.sequence) {
        const now = Date.now();
        if (now - seqState.current.ts > SEQUENCE_TIMEOUT_MS) seqState.current.buf = [];
        seqState.current.ts = now;
        if (e.key.length === 1) seqState.current.buf.push(e.key.toLowerCase());
        if (seqState.current.buf.length > def.keys.length) {
          seqState.current.buf = seqState.current.buf.slice(-def.keys.length);
        }
        const match = def.keys.every((k, i) =>
          seqState.current.buf[seqState.current.buf.length - def.keys.length + i] === k.toLowerCase(),
        );
        if (match) {
          seqState.current.buf = [];
          def.handler(e);
        }
        return;
      }

      // Combo
      const wantsMeta = def.keys.includes('meta');
      const wantsCtrl = def.keys.includes('ctrl');
      const wantsShift = def.keys.includes('shift');
      const wantsAlt = def.keys.includes('alt');
      const key = def.keys.find(k => !['meta', 'ctrl', 'shift', 'alt'].includes(k));

      if (wantsMeta && !(e.metaKey || e.ctrlKey)) return; // accept ctrl on non-mac
      if (wantsCtrl && !e.ctrlKey) return;
      if (wantsShift && !e.shiftKey) return;
      if (wantsAlt && !e.altKey) return;
      if (key && e.key.toLowerCase() !== key.toLowerCase()) return;
      def.handler(e);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Convenience: register many at once. */
export function useShortcuts(defs: Array<ShortcutDef | null>, deps: unknown[] = []) {
  // Map each def to a single useShortcut call. The array must be stable in length.
  // We collapse into a single effect to avoid per-render churn.
  const seqStates = useRef(defs.map(() => ({ buf: [] as string[], ts: 0 })));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      defs.forEach((def, i) => {
        if (!def) return;
        if (inEditable && !def.allowInEditable) return;

        if (def.sequence) {
          const s = seqStates.current[i];
          const now = Date.now();
          if (now - s.ts > SEQUENCE_TIMEOUT_MS) s.buf = [];
          s.ts = now;
          if (e.key.length === 1) s.buf.push(e.key.toLowerCase());
          if (s.buf.length > def.keys.length) s.buf = s.buf.slice(-def.keys.length);
          const match = def.keys.every((k, j) =>
            s.buf[s.buf.length - def.keys.length + j] === k.toLowerCase(),
          );
          if (match) {
            s.buf = [];
            def.handler(e);
          }
          return;
        }

        const wantsMeta = def.keys.includes('meta');
        const wantsCtrl = def.keys.includes('ctrl');
        const wantsShift = def.keys.includes('shift');
        const wantsAlt = def.keys.includes('alt');
        const key = def.keys.find(k => !['meta', 'ctrl', 'shift', 'alt'].includes(k));

        if (wantsMeta && !(e.metaKey || e.ctrlKey)) return;
        if (wantsCtrl && !e.ctrlKey) return;
        if (wantsShift && !e.shiftKey) return;
        if (wantsAlt && !e.altKey) return;
        if (key && e.key.toLowerCase() !== key.toLowerCase()) return;
        def.handler(e);
      });
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
