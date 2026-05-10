import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trap Tab focus inside the returned ref while `active` is true.
 * Stores the previously-focused element on open and restores it on close.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    prev.current = document.activeElement as HTMLElement | null;

    const root = ref.current;
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => !el.hasAttribute('data-focus-trap-skip') && el.offsetParent !== null,
    );
    const first = focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && idx === list.length - 1) {
        e.preventDefault();
        list[0].focus();
      }
    };

    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      prev.current?.focus?.();
    };
  }, [active]);

  return ref;
}
