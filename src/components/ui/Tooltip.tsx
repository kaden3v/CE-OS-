import { useState, useRef, useId, ReactElement, cloneElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tooltip primitive — keyboard-accessible, mouse-hover and focus-triggered.
 * Single primitive across the OS; do not write component-local tooltips.
 */
export function Tooltip({
  label,
  side = 'top',
  disabled = false,
  children,
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  if (disabled) return children;

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 400);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };

  const positions = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1',
  } as const;

  const trigger = cloneElement(children, {
    'aria-describedby': open ? id : undefined,
    onMouseEnter: (e: React.MouseEvent) => { show(); (children.props as any).onMouseEnter?.(e); },
    onMouseLeave: (e: React.MouseEvent) => { hide(); (children.props as any).onMouseLeave?.(e); },
    onFocus:      (e: React.FocusEvent) => { setOpen(true); (children.props as any).onFocus?.(e); },
    onBlur:       (e: React.FocusEvent) => { setOpen(false); (children.props as any).onBlur?.(e); },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-50 whitespace-nowrap px-2 py-1 rounded text-[11px] font-medium',
            'bg-bg-base text-text-primary border border-border-subtle shadow-lg pointer-events-none',
            'animate-in fade-in zoom-in-95 duration-[120ms]',
            positions[side],
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
