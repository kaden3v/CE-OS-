import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
 * Shared modal shell. Fixes the three things every hand-rolled modal got wrong
 * on mobile: it caps height at 85dvh and scrolls the body (so submit buttons
 * stay reachable with the keyboard open), closes on Escape, and closes on
 * backdrop tap. Renders as a bottom sheet on phones, centered card on desktop.
 */
export function Modal({ open, onClose, title, children, size = "md", className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-bg-base/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full bg-bg-elevated border border-border-strong shadow-2xl flex flex-col",
          "max-h-[90dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-xl",
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
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
  );
}
