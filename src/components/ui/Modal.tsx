import { ReactNode, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useScrollLock } from "@/hooks/useScrollLock";

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Scrollable body — pass the form (with its own submit footer) as children. */
  children: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Shared modal shell. Fixes what every hand-rolled modal got wrong on mobile:
 * caps height at 85dvh and scrolls the body (so submit buttons stay reachable
 * with the keyboard open), closes on Escape and on backdrop tap, traps focus,
 * restores it on close, and freezes the page behind it. Renders as a bottom
 * sheet on phones, centered card on desktop.
 */
export function Modal({ open, onClose, title, children, size = "md", className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Shared stack, so Escape over an open drawer closes only this modal.
  useEscapeKey(open, onClose);
  useFocusTrap(open, dialogRef);
  useScrollLock(open);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* The backdrop is a sibling of the dialog, not its parent. As a parent
            it needed an onClick on the dialog just to stopPropagation, which
            made the dialog itself look like a click target to assistive tech.
            role="presentation" marks it as the decoration it is — closing by
            tapping it is a convenience; Escape is the real keyboard path. */}
        <div
          role="presentation"
          onClick={onClose}
          className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          // Fallback focus target when the dialog holds no focusable control,
          // so opening one never leaves focus stranded on the page behind.
          tabIndex={-1}
          className={cn(
            "relative w-full bg-bg-elevated border border-border-strong shadow-2xl flex flex-col",
            // The sheet is flush with the bottom of the screen on phones. The
            // tab bar now sits *behind* the backdrop (z-nav < z-modal), so the
            // only thing to clear is the home indicator.
            "max-h-[90dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-xl",
            "pb-[env(safe-area-inset-bottom)] sm:pb-0",
            SIZES[size],
            className,
          )}
        >
          <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 -mr-2 rounded-lg text-text-secondary hover:text-text-primary active:bg-bg-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    </Portal>
  );
}
